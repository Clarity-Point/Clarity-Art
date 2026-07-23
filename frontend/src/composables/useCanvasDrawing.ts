import { ref, onMounted, watch } from 'vue';

type DrawTool = 'pen' | 'eraser';

/**
 * Encapsulates the free-draw canvas used by ImageAnalysisView: pen/eraser
 * tools, pointer + touch stroke handling, tap-to-fullscreen, emptiness
 * detection and surface clearing. Pure drawing concerns only — analysis state
 * reset stays with the caller. Extracted verbatim to preserve behaviour.
 */
export function useCanvasDrawing() {
  const drawingCanvasRef = ref<HTMLCanvasElement | null>(null);
  const canvasCtx = ref<CanvasRenderingContext2D | null>(null);
  const isDrawing = ref(false);
  const currentColor = ref('black');
  const currentTool = ref<DrawTool>('pen');
  const lineWidth = ref(5);
  const isCanvasEmpty = ref(true);

  const isCanvasFullscreen = ref(false);
  const mouseDownTime = ref(0);
  const mouseDownPos = ref({ x: 0, y: 0 });
  const MAX_CLICK_DURATION = 250;
  const MAX_CLICK_MOVEMENT = 8;
  let potentialClick = false;

  const toggleCanvasFullscreen = () => {
    isCanvasFullscreen.value = !isCanvasFullscreen.value;
  };

  const getMousePos = (event: MouseEvent | TouchEvent): { x: number; y: number } => {
    if (!drawingCanvasRef.value) return { x: 0, y: 0 };
    const rect = drawingCanvasRef.value.getBoundingClientRect();
    if (event instanceof MouseEvent) {
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    } else if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX - rect.left, y: event.touches[0].clientY - rect.top };
    }
    return { x: 0, y: 0 };
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (!canvasCtx.value) return;
    const pos = getMousePos(event);
    mouseDownTime.value = Date.now();
    mouseDownPos.value = pos;
    potentialClick = true;
    isDrawing.value = true;
    canvasCtx.value.beginPath();
    canvasCtx.value.moveTo(pos.x, pos.y);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDrawing.value || !canvasCtx.value) return;
    const pos = getMousePos(event);
    if (potentialClick) {
      const dx = Math.abs(pos.x - mouseDownPos.value.x);
      const dy = Math.abs(pos.y - mouseDownPos.value.y);
      if (dx > MAX_CLICK_MOVEMENT || dy > MAX_CLICK_MOVEMENT) {
        potentialClick = false;
      }
    }
    if (isDrawing.value && !potentialClick) {
      if (currentTool.value === 'pen') {
        canvasCtx.value.strokeStyle = currentColor.value;
        canvasCtx.value.lineWidth = Number(lineWidth.value);
      } else if (currentTool.value === 'eraser') {
        canvasCtx.value.strokeStyle = 'white';
        canvasCtx.value.lineWidth = Number(lineWidth.value) * 2;
      }
      canvasCtx.value.lineTo(pos.x, pos.y);
      canvasCtx.value.stroke();
    }
  };

  const handleMouseUpOrTouchEnd = () => {
    const duration = Date.now() - mouseDownTime.value;
    if (potentialClick && duration < MAX_CLICK_DURATION) {
      toggleCanvasFullscreen();
      isDrawing.value = false;
      potentialClick = false;
      return;
    }
    if (isDrawing.value && canvasCtx.value) {
      canvasCtx.value.closePath();
    }
    isDrawing.value = false;
    checkIfCanvasIsEmpty();
    potentialClick = false;
  };

  const handleMouseUp = () => {
    handleMouseUpOrTouchEnd();
  };
  const handleMouseLeave = () => {
    if (isDrawing.value) {
      if (canvasCtx.value) canvasCtx.value.closePath();
      isDrawing.value = false;
      checkIfCanvasIsEmpty();
    }
    potentialClick = false;
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (!canvasCtx.value) return;
    const pos = getMousePos(event);
    mouseDownTime.value = Date.now();
    mouseDownPos.value = pos;
    potentialClick = true;
    isDrawing.value = true;
    canvasCtx.value.beginPath();
    canvasCtx.value.moveTo(pos.x, pos.y);
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (!isDrawing.value || !canvasCtx.value) return;
    const pos = getMousePos(event);
    if (potentialClick) {
      const dx = Math.abs(pos.x - mouseDownPos.value.x);
      const dy = Math.abs(pos.y - mouseDownPos.value.y);
      if (dx > MAX_CLICK_MOVEMENT || dy > MAX_CLICK_MOVEMENT) {
        potentialClick = false;
      }
    }
    if (isDrawing.value && !potentialClick) {
      if (currentTool.value === 'pen') {
        canvasCtx.value.strokeStyle = currentColor.value;
        canvasCtx.value.lineWidth = Number(lineWidth.value);
      } else if (currentTool.value === 'eraser') {
        canvasCtx.value.strokeStyle = 'white';
        canvasCtx.value.lineWidth = Number(lineWidth.value) * 2;
      }
      canvasCtx.value.lineTo(pos.x, pos.y);
      canvasCtx.value.stroke();
    }
  };
  const handleTouchEnd = () => {
    handleMouseUpOrTouchEnd();
  };

  const setTool = (tool: DrawTool, color: string = 'black') => {
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
      canvasCtx.value.fillStyle = 'white';
      canvasCtx.value.fillRect(0, 0, drawingCanvasRef.value.width, drawingCanvasRef.value.height);
      checkIfCanvasIsEmpty();
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
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    setTool,
    clearCanvasSurface,
  };
}
