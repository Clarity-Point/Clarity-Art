import { ref, onMounted, watch } from 'vue';

type DrawTool = 'pen' | 'eraser';
type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };

/**
 * Encapsulates the free-draw canvas used by ImageAnalysisView: pen/eraser
 * tools, pointer + touch stroke handling, tap-to-fullscreen, emptiness
 * detection and surface clearing. Pure drawing concerns only — analysis state
 * reset stays with the caller.
 */
export function useCanvasDrawing({
  tapToFullscreen = true,
  onChange,
}: {
  tapToFullscreen?: boolean;
  onChange?: () => void;
} = {}) {
  const drawingCanvasRef = ref<HTMLCanvasElement | null>(null);
  const canvasCtx = ref<CanvasRenderingContext2D | null>(null);
  const isDrawing = ref(false);
  const currentColor = ref('#000000');
  const currentTool = ref<DrawTool>('pen');
  const lineWidth = ref(5);
  const isCanvasEmpty = ref(true);

  const isCanvasFullscreen = ref(false);
  const mouseDownTime = ref(0);
  const mouseDownPos = ref({ x: 0, y: 0 });
  const MAX_CLICK_DURATION = 250;
  const MAX_CLICK_MOVEMENT = 8;
  let potentialClick = false;
  let strokeBounds: Bounds | undefined;
  let strokeMayErase = false;
  let strokeMayAddInk = false;
  let inkBounds: Bounds | undefined;
  let activeTouchId: number | undefined;
  let activeMouseButton: number | undefined;
  let lastPoint: Point = { x: 0, y: 0 };

  const toggleCanvasFullscreen = () => {
    isCanvasFullscreen.value = !isCanvasFullscreen.value;
  };

  function findTouch(touches: TouchList, id: number) {
    for (let index = 0; index < touches.length; index++) {
      const touch = touches[index];
      if (touch.identifier === id) return touch;
    }
  }

  /*
   * Translate a pointer/touch position into canvas backing-store coordinates.
   *
   * The element is CSS-resized (max-width: 100%, and 100vw/100vh in fullscreen)
   * while the backing store keeps its intrinsic width/height. Returning raw
   * clientX-offset values therefore draws at the wrong position whenever the
   * two differ — on any viewport narrower than the canvas width, and always in
   * fullscreen. Scaling by the ratio fixes both, and the `|| 1` guard keeps a
   * zero-size layout (canvas hidden, display:none) from producing NaN that
   * silently poisons the whole stroke.
   */
  const getMousePos = (event: MouseEvent | TouchEvent): { x: number; y: number } => {
    const canvas = drawingCanvasRef.value;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };

    let clientX: number;
    let clientY: number;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      const touch =
        activeTouchId === undefined ? undefined : findTouch(event.touches, activeTouchId);
      if (!touch) return { x: 0, y: 0 };
      clientX = touch.clientX;
      clientY = touch.clientY;
    }

    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const applyStrokeStyle = (context: CanvasRenderingContext2D) => {
    const erasing = currentTool.value === 'eraser';
    context.strokeStyle = erasing ? '#ffffff' : currentColor.value;
    context.lineWidth = Number(lineWidth.value) * (erasing ? 2 : 1);
  };

  const startStroke = (event: MouseEvent | TouchEvent) => {
    if (!canvasCtx.value || isDrawing.value) return;
    if (event instanceof MouseEvent) {
      activeMouseButton = event.button;
    } else {
      const touch = event.changedTouches[0];
      if (!touch) return;
      activeTouchId = touch.identifier;
    }
    const pos = getMousePos(event);
    mouseDownTime.value = Date.now();
    mouseDownPos.value = pos;
    potentialClick = tapToFullscreen;
    strokeBounds = undefined;
    strokeMayErase = false;
    strokeMayAddInk = false;
    lastPoint = pos;
    isDrawing.value = true;
  };

  function union(first: Bounds, second: Bounds): Bounds {
    return {
      left: Math.min(first.left, second.left),
      top: Math.min(first.top, second.top),
      right: Math.max(first.right, second.right),
      bottom: Math.max(first.bottom, second.bottom),
    };
  }
  function intersects(first: Bounds, second: Bounds) {
    return (
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top
    );
  }
  function recordPaint(context: CanvasRenderingContext2D, from: Point, to: Point) {
    const padding = context.lineWidth / 2 + 2;
    const paint = {
      left: Math.min(from.x, to.x) - padding,
      top: Math.min(from.y, to.y) - padding,
      right: Math.max(from.x, to.x) + padding,
      bottom: Math.max(from.y, to.y) + padding,
    };
    strokeBounds = strokeBounds ? union(strokeBounds, paint) : paint;
    const color = context.strokeStyle;
    const pureWhite = typeof color === 'string' && color.toLowerCase() === '#ffffff';
    strokeMayAddInk ||= !pureWhite;
    // Blending a non-white opaque color cannot remove the last ink pixel.
    strokeMayErase ||= pureWhite || typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color);
  }

  const moveStroke = (event: MouseEvent | TouchEvent) => {
    const context = canvasCtx.value;
    if (!isDrawing.value || !context) return;
    if (event instanceof MouseEvent) {
      if (activeMouseButton === undefined) return;
    } else if (activeTouchId === undefined || !findTouch(event.changedTouches, activeTouchId)) {
      return;
    }
    const pos = getMousePos(event);
    if (potentialClick) {
      const dx = Math.abs(pos.x - mouseDownPos.value.x);
      const dy = Math.abs(pos.y - mouseDownPos.value.y);
      if (dx <= MAX_CLICK_MOVEMENT && dy <= MAX_CLICK_MOVEMENT) return;
      potentialClick = false;
    }
    applyStrokeStyle(context);
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(pos.x, pos.y);
    context.stroke();
    recordPaint(context, lastPoint, pos);
    lastPoint = pos;
  };

  const closeStroke = () => {
    if (!isDrawing.value) return;
    canvasCtx.value?.closePath();
    isDrawing.value = false;
    activeTouchId = undefined;
    activeMouseButton = undefined;
    potentialClick = false;
    if (!strokeBounds) return;
    if (!inkBounds) {
      if (strokeMayAddInk) checkIfCanvasIsEmpty(strokeBounds);
    } else if (strokeMayErase && intersects(inkBounds, strokeBounds)) {
      checkIfCanvasIsEmpty(strokeMayAddInk ? union(inkBounds, strokeBounds) : inkBounds);
    } else if (strokeMayAddInk) {
      inkBounds = union(inkBounds, strokeBounds);
    }
    onChange?.();
  };

  const endStroke = () => {
    const context = canvasCtx.value;
    if (!isDrawing.value || !context) return;
    if (potentialClick && Date.now() - mouseDownTime.value < MAX_CLICK_DURATION) {
      toggleCanvasFullscreen();
    } else if (!tapToFullscreen && !strokeBounds) {
      applyStrokeStyle(context);
      context.fillStyle = context.strokeStyle;
      context.beginPath();
      context.arc(
        mouseDownPos.value.x,
        mouseDownPos.value.y,
        context.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      context.fill();
      recordPaint(context, mouseDownPos.value, mouseDownPos.value);
    }
    closeStroke();
  };

  const setTool = (tool: DrawTool, color: string = currentColor.value) => {
    currentTool.value = tool;
    if (tool === 'pen') {
      currentColor.value = color;
    }
    if (canvasCtx.value) {
      canvasCtx.value.lineWidth = Number(lineWidth.value);
    }
  };

  const checkIfCanvasIsEmpty = (bounds?: Bounds) => {
    const canvas = drawingCanvasRef.value;
    const context = canvasCtx.value;
    if (!canvas || !context) {
      inkBounds = undefined;
      isCanvasEmpty.value = true;
      return;
    }
    const left = Math.max(0, Math.floor(bounds?.left ?? 0));
    const top = Math.max(0, Math.floor(bounds?.top ?? 0));
    const width = Math.min(canvas.width, Math.ceil(bounds?.right ?? canvas.width)) - left;
    const height = Math.min(canvas.height, Math.ceil(bounds?.bottom ?? canvas.height)) - top;
    if (width <= 0 || height <= 0) {
      inkBounds = undefined;
      isCanvasEmpty.value = true;
      return;
    }
    const colors = new Uint32Array(context.getImageData(left, top, width, height).data.buffer);
    let firstColumn = width;
    let lastColumn = -1;
    let firstRow = height;
    let lastRow = -1;
    for (let index = 0; index < colors.length; index++) {
      if (colors[index] === 0xffffffff || colors[index] === 0) continue;
      const row = Math.floor(index / width);
      const column = index % width;
      firstColumn = Math.min(firstColumn, column);
      lastColumn = Math.max(lastColumn, column);
      firstRow = Math.min(firstRow, row);
      lastRow = row;
    }
    isCanvasEmpty.value = lastColumn < 0;
    inkBounds = isCanvasEmpty.value
      ? undefined
      : {
          left: left + firstColumn,
          right: left + lastColumn + 1,
          top: top + firstRow,
          bottom: top + lastRow + 1,
        };
  };

  // Clears the drawing surface only. Returns true when the surface was actually
  // cleared (ctx + canvas present), mirroring the original guard so callers can
  // gate their own analysis-state resets on the same condition.
  const clearCanvasSurface = (notify = true): boolean => {
    if (canvasCtx.value && drawingCanvasRef.value) {
      const hadDrawing = !isCanvasEmpty.value;
      canvasCtx.value.fillStyle = 'white';
      canvasCtx.value.fillRect(0, 0, drawingCanvasRef.value.width, drawingCanvasRef.value.height);
      isDrawing.value = false;
      activeTouchId = undefined;
      activeMouseButton = undefined;
      strokeBounds = undefined;
      inkBounds = undefined;
      isCanvasEmpty.value = true;
      if (hadDrawing && notify) onChange?.();
      return true;
    }
    return false;
  };

  onMounted(() => {
    if (drawingCanvasRef.value) {
      canvasCtx.value = drawingCanvasRef.value.getContext('2d');
      if (canvasCtx.value) {
        canvasCtx.value.fillStyle = 'white';
        canvasCtx.value.fillRect(0, 0, drawingCanvasRef.value.width, drawingCanvasRef.value.height);
        canvasCtx.value.lineCap = 'round';
        canvasCtx.value.lineJoin = 'round';
      }
    }
  });

  watch(lineWidth, (newLineWidth) => {
    if (canvasCtx.value) {
      canvasCtx.value.lineWidth = Number(newLineWidth);
    }
  });

  return {
    drawingCanvasRef,
    currentColor,
    currentTool,
    lineWidth,
    isCanvasEmpty,
    isDrawing,
    checkIfCanvasIsEmpty,
    isCanvasFullscreen,
    toggleCanvasFullscreen,
    handleMouseDown: startStroke,
    handleMouseMove: moveStroke,
    handleMouseUp: (event: MouseEvent) => {
      if (event.button === activeMouseButton) endStroke();
    },
    handleMouseLeave: closeStroke,
    handleTouchStart: startStroke,
    handleTouchMove: moveStroke,
    handleTouchEnd: (event: TouchEvent) => {
      if (activeTouchId !== undefined && findTouch(event.changedTouches, activeTouchId))
        endStroke();
    },
    handleTouchCancel: (event: TouchEvent) => {
      if (activeTouchId !== undefined && findTouch(event.changedTouches, activeTouchId))
        closeStroke();
    },
    setTool,
    clearCanvasSurface,
  };
}
