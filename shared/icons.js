// stroke 기반 24×24 아이콘. 값은 <svg> 내부 마크업만 담고, 래핑은 AppIcon.vue가 한다
// (viewBox / fill:none / stroke:currentColor / linecap:round). 이모지를 쓰지 않는 것이
// Circuit 디자인의 규칙이므로 새 아이콘도 여기에 추가한다.
export const icons = {
  // 서비스
  queue: '<rect x="3" y="4" width="14" height="4" rx="1"/><rect x="3" y="10" width="14" height="4" rx="1"/><rect x="3" y="16" width="9" height="4" rx="1"/>',
  energy: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z"/>',
  notice: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14 8.5a4.5 4.5 0 0 1 0 7"/><path d="M17 5.5a8 8 0 0 1 0 13"/>',
  chatbot: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M7.5 17v3.5L12 17"/><circle cx="9.5" cy="11" r="1.2"/><circle cx="14.5" cy="11" r="1.2"/>',
  forum: '<path d="M13 14H7l-3.5 3V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2z"/><path d="M17 8h1.5a2 2 0 0 1 2 2v9l-3.5-3H11"/>',

  // 관리
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17.5 10.5h4M19.5 8.5v4"/>',
  logs: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9.5 12h6M9.5 16h6M9.5 8h2.5"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="m3.5 5.5 1 1 2-2"/><path d="m3.5 11.5 1 1 2-2"/><path d="m3.5 17.5 1 1 2-2"/>',

  // 상태 / 액션
  external: '<path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5"/>',
  logout: '<path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/><path d="M16 8l4 4-4 4"/><path d="M20 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  chevron: '<path d="m6 9.5 6 6 6-6"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5v5h-5"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alert: '<path d="M12 3.5 2.8 20h18.4L12 3.5z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none"/>',
};

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(icons, name);
}
