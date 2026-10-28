// 용어 사전의 아이콘을 움직이는 아이콘(@animateicons/vanilla, MIT, Lucide 모양)으로 바꿔요.
// build-site.mjs가 이 파일만 묶어서 public/UI/icons.js로 써요 (쓰는 아이콘만 넣어서 작게).
// 키는 페이지의 ic('이름')과 같아요.
import { renderIcon, play, prefersReducedMotion } from '@animateicons/vanilla';
import {
  Plus, X, Check, Menu, Search, Heart, EllipsisVertical, House, Star, Bell, User, ChevronDown, ChevronRight, ChevronLeft,
  Trash2, Copy, Upload, Pencil, Inbox, Folder, File, Share, ArrowUp, LayoutGrid,
} from '@animateicons/vanilla/lucide';

window.AnimIcons = {
  renderIcon, play, reduced: prefersReducedMotion,
  icons: {
    plus: Plus, close: X, check: Check, menu: Menu, search: Search, heart: Heart, more: EllipsisVertical, home: House, star: Star,
    bell: Bell, user: User, 'chev-d': ChevronDown, 'chev-r': ChevronRight, 'chev-l': ChevronLeft, trash: Trash2, copy: Copy,
    upload: Upload, edit: Pencil, inbox: Inbox, folder: Folder, file: File, share: Share, 'arrow-up': ArrowUp, grid: LayoutGrid,
  },
};
