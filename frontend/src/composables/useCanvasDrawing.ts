import { ref, onMounted, watch } from 'vue';

type DrawTool = 'pen' | 'eraser';

/**
 * Encapsulates the free-draw canvas used by ImageAnalysisView: pen/eraser
 * tools, pointer + touch stroke handling, tap-to-fullscreen, emptiness
 * detection and surface clearing. Pure drawing concerns only — analysis state
 * reset stays with the caller. Extracted verbatim to preserve behaviour.
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
  let strokeChanged = false;

  const toggleCanvasFullscreen = () => {
    isCanvasFullscreen.value = !isCanvasFullscreen.value;
  };

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
    } else if (event.touches && event.touches[0]) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      return { x: 0, y: 0 };
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
    if (!canvasCtx.value) return;
    const pos = getMousePos(event);
    mouseDownTime.value = Date.now();
    mouseDownPos.value = pos;
    potentialClick = tapToFullscreen;
    strokeChanged = false;
    isDrawing.value = true;
    canvasCtx.value.beginPath();
    canvasCtx.value.moveTo(pos.x, pos.y);
  };

  const moveStroke = (event: MouseEvent | TouchEvent) => {
    const context = canvasCtx.value;
    if (!isDrawing.value || !context) return;
    const pos = getMousePos(event);
    if (potentialClick) {
      const dx = Math.abs(pos.x - mouseDownPos.value.x);
      const dy = Math.abs(pos.y - mouseDownPos.value.y);
      if (dx <= MAX_CLICK_MOVEMENT && dy <= MAX_CLICK_MOVEMENT) return;
      potentialClick = false;
    }
    applyStrokeStyle(context);
    context.lineTo(pos.x, pos.y);
    context.stroke();
    strokeChanged = true;
  };

  const closeStroke = () => {
    if (!isDrawing.value) return;
    canvasCtx.value?.closePath();
    isDrawing.value = false;
    potentialClick = false;
    checkIfCanvasIsEmpty();
    if (strokeChanged) onChange?.();
  };

  const endStroke = () => {
    const context = canvasCtx.value;
    if (!isDrawing.value || !context) return;
    if (potentialClick && Date.now() - mouseDownTime.value < MAX_CLICK_DURATION) {
      toggleCanvasFullscreen();
    } else if (!tapToFullscreen && !strokeChanged) {
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
      strokeChanged = true;
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

  const checkIfCanvasIsEmpty = () => {
    if (!drawingCanvasRef.value || !canvasCtx.value) {
      isCanvasEmpty.value = true;
      return;
    }
    const canvas = drawingCanvasRef.value;
    const ctx = canvasCtx.value;
    const pixelBuffer = new Uint32Array(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer,
    );
    isCanvasEmpty.value = !pixelBuffer.some(
      (color) => color !== 0xffffffff && color !== 0x00000000,
    );
  };

  // Clears the drawing surface only. Returns true when the surface was actually
  // cleared (ctx + canvas present), mirroring the original guard so callers can
  // gate their own analysis-state resets on the same condition.
  const clearCanvasSurface = (): boolean => {
    if (canvasCtx.value && drawingCanvasRef.value) {
      const hadDrawing = !isCanvasEmpty.value;
      canvasCtx.value.fillStyle = 'white';
      canvasCtx.value.fillRect(0, 0, drawingCanvasRef.value.width, drawingCanvasRef.value.height);
      checkIfCanvasIsEmpty();
      if (hadDrawing) onChange?.();
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
        checkIfCanvasIsEmpty();
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
    isCanvasFullscreen,
    toggleCanvasFullscreen,
    handleMouseDown: startStroke,
    handleMouseMove: moveStroke,
    handleMouseUp: endStroke,
    handleMouseLeave: closeStroke,
    handleTouchStart: startStroke,
    handleTouchMove: moveStroke,
    handleTouchEnd: endStroke,
    setTool,
    clearCanvasSurface,
  };
}
