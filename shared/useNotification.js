import { toast } from "vue-sonner";

// sonner는 메시지를 텍스트 노드로 렌더하므로 HTML escape가 필요 없다(XSS 안전).
export function useNotification() {
  return {
    success: (msg) => toast.success(msg),
    error: (msg) => toast.error(msg),
    warning: (msg) => toast.warning(msg),
    info: (msg) => toast.message(msg),
  };
}
