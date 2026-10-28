// 용어 사전의 아이콘을 움직이는 아이콘(@animateicons/vanilla, MIT)으로 바꿔요. 모양은 Lucide와 Huge Icons 두 가지예요.
// build-site.mjs가 이 파일만 묶어서 public/UI/icons.js로 써요 (쓰는 아이콘만 넣어서 작게).
// 키는 페이지의 ic('이름')과 같아요.
import { renderIcon, play } from '@animateicons/vanilla';
import { ArrowUp, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, EllipsisVertical, File, Folder, Heart, House, Inbox, LayoutGrid, Menu, Pencil, Plus, Search, Share, Star, Trash2, Upload, User, X } from '@animateicons/vanilla/lucide';
import { Add01 as HAdd01, ArrowUp02 as HArrowUp02, Cancel01 as HCancel01, Check as HCheck, ChevronDown as HChevronDown, ChevronLeft as HChevronLeft, ChevronRight as HChevronRight, Copy as HCopy, Delete02 as HDelete02, File01 as HFile01, Folder01 as HFolder01, GridView as HGridView, Heart as HHeart, Home01 as HHome01, Mail01 as HMail01, Menu01 as HMenu01, MoreVertical as HMoreVertical, Notification as HNotification, Pencil as HPencil, Search as HSearch, Share01 as HShare01, Star as HStar, Upload01 as HUpload01, User as HUser } from '@animateicons/vanilla/huge';
// 이름표에서 쓰도록 모아 둬요 (import *를 쓰면 아이콘 전체가 묶여서 커져요)
const L = { ArrowUp, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, EllipsisVertical, File, Folder, Heart, House, Inbox, LayoutGrid, Menu, Pencil, Plus, Search, Share, Star, Trash2, Upload, User, X };
const H = { Add01: HAdd01, ArrowUp02: HArrowUp02, Cancel01: HCancel01, Check: HCheck, ChevronDown: HChevronDown, ChevronLeft: HChevronLeft, ChevronRight: HChevronRight, Copy: HCopy, Delete02: HDelete02, File01: HFile01, Folder01: HFolder01, GridView: HGridView, Heart: HHeart, Home01: HHome01, Mail01: HMail01, Menu01: HMenu01, MoreVertical: HMoreVertical, Notification: HNotification, Pencil: HPencil, Search: HSearch, Share01: HShare01, Star: HStar, Upload01: HUpload01, User: HUser };

const NAMES = {
  //            Lucide              Huge
  plus:       ['Plus',              'Add01'],
  close:      ['X',                 'Cancel01'],
  check:      ['Check',             'Check'],
  menu:       ['Menu',              'Menu01'],
  search:     ['Search',            'Search'],
  heart:      ['Heart',             'Heart'],
  more:       ['EllipsisVertical',  'MoreVertical'],
  home:       ['House',             'Home01'],
  star:       ['Star',              'Star'],
  bell:       ['Bell',              'Notification'],
  user:       ['User',              'User'],
  'chev-d':   ['ChevronDown',       'ChevronDown'],
  'chev-r':   ['ChevronRight',      'ChevronRight'],
  'chev-l':   ['ChevronLeft',       'ChevronLeft'],
  trash:      ['Trash2',            'Delete02'],
  copy:       ['Copy',              'Copy'],
  upload:     ['Upload',            'Upload01'],
  edit:       ['Pencil',            'Pencil'],
  inbox:      ['Inbox',             'Mail01'],
  folder:     ['Folder',            'Folder01'],
  file:       ['File',              'File01'],
  share:      ['Share',             'Share01'],
  'arrow-up': ['ArrowUp',           'ArrowUp02'],
  grid:       ['LayoutGrid',        'GridView'],
};
const pick = (lib, i) => Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [k, lib[v[i]]]));
window.AnimIcons = { renderIcon, play, icons: { lucide: pick(L, 0), huge: pick(H, 1) } };
