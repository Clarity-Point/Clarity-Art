import axios, { type AxiosRequestConfig } from 'axios';
import { onBeforeUnmount, onMounted } from 'vue';
import { useAuthStore } from '@/stores/authStore';

const API = import.meta.env.VITE_API_URL || '/api';
export const captionLimit = 600;

export interface Practice {
  id: string;
  title: string;
  minutes: number;
  material: string;
  supplies: string;
  steps: string[];
  prompt: string;
}

export interface Series {
  id: string;
  title: string;
  practiceIds: string[];
}

export interface Catalog {
  practices: Practice[];
  series: Series[];
}

export interface ReflectionText {
  content: string;
  createdAt: string;
}

export interface Reflection extends ReflectionText {
  id: string;
}

export interface Work {
  id: string;
  practiceId: string | null;
  title: string;
  note: string;
  hasImage: boolean;
  createdAt: string;
  reflections: Reflection[];
}

export interface DrawingFile {
  mimeType: string;
  base64: string;
}

export interface ShareChoice {
  workId: string;
  includeImage: boolean;
  includeNote: boolean;
  reflectionIds: string[];
}

export interface IncomingShare {
  id: string;
  ownerName: string;
  createdAt: string;
  workCount: number;
}

export interface IncomingShareDetails {
  items: Array<{
    workId: string;
    title: string;
    note: string | null;
    reflections: ReflectionText[];
    includesImage: boolean;
  }>;
}

export interface OutgoingShare {
  id: string;
  therapistId: string;
  therapistName: string;
  createdAt: string;
  items: Array<{ title: string }>;
}

export interface Specialist {
  id: string;
  name: string;
}

export const specialistLabel = (person: Specialist) =>
  `${person.name} · код ${person.id.slice(-8)}`;

export function practiceError(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const response = error.response?.data;
    if (typeof response?.error === 'string') return response.error;
    if (typeof response?.message === 'string') return response.message;
  }
  return fallback;
}

export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getCatalog() {
  return (await axios.get<Catalog>(`${API}/practices/catalog`)).data;
}

export function usePracticeApi(monitorSession = false) {
  const auth = useAuthStore();
  const capture = () => ({ id: auth.user?.id, revision: auth.sessionRevision });
  const isCurrent = (session: ReturnType<typeof capture>) =>
    Boolean(session.id) &&
    session.id === auth.user?.id &&
    session.revision === auth.sessionRevision;

  async function request<T>(
    session: ReturnType<typeof capture>,
    path: string,
    config: AxiosRequestConfig = {},
  ): Promise<T> {
    if (!isCurrent(session)) throw new Error('Account changed');
    try {
      const response = await axios.request<T>({
        ...config,
        url: `${API}${path}`,
        headers: { ...config.headers, 'X-Expected-User-Id': session.id },
      });
      if (!isCurrent(session)) throw new Error('Account changed');
      return response.data;
    } catch (reason) {
      if (axios.isAxiosError(reason) && reason.response?.status === 409 && isCurrent(session)) {
        const data: unknown = reason.response.data;
        const body: unknown =
          data instanceof Blob
            ? await data
                .text()
                .then((value) => JSON.parse(value))
                .catch(() => null)
            : data;
        if (
          isCurrent(session) &&
          body &&
          typeof body === 'object' &&
          'code' in body &&
          body.code === 'SESSION_CHANGED'
        ) {
          auth.expireSession();
          void auth.restoreSession();
        }
      }
      throw reason;
    }
  }

  if (monitorSession) {
    const checkSession = () => {
      const session = capture();
      if (!session.id) return;
      void request(session, '/practices/session').catch(() => undefined);
    };
    onMounted(() => window.addEventListener('focus', checkSession));
    onBeforeUnmount(() => window.removeEventListener('focus', checkSession));
  }

  return { auth, capture, isCurrent, request };
}

export const practiceDate = (date: string) =>
  new Date(date).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });

export function asDrawing(dataUrl: string): DrawingFile | undefined {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  return match ? { mimeType: match[1], base64: match[2] } : undefined;
}

export async function preparePaperPhoto(file: File): Promise<DrawingFile> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  ) {
    throw new Error('Выберите PNG, JPEG или WebP до 12 МиБ.');
  }
  const url = URL.createObjectURL(file);
  try {
    const photo = new Image();
    photo.src = url;
    await photo.decode();
    const scale = Math.min(1, 1024 / Math.max(photo.naturalWidth, photo.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить фотографию.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    const result = asDrawing(canvas.toDataURL('image/jpeg', 0.86));
    if (!result) throw new Error('Не удалось подготовить фотографию.');
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
