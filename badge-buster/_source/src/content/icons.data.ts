import type { AppIconDef } from '../types/content.types';

// 12 个 App 图标。社交/消息类 spawnWeight 与 maxBadge 调高 —— 更折磨。
export const ICONS: AppIconDef[] = [
  { id: 'icon_chat',     name: '聊天',   artId: 'icon_chat',     fallbackColor: '#5B8DEF', fallbackGlyph: '💬', spawnWeight: 8,  maxBadge: 30 },
  { id: 'icon_mail',     name: '邮件',   artId: 'icon_mail',     fallbackColor: '#FF9F43', fallbackGlyph: '✉️', spawnWeight: 7,  maxBadge: 50 },
  { id: 'icon_social',   name: '社交',   artId: 'icon_social',   fallbackColor: '#26C6A6', fallbackGlyph: '👥', spawnWeight: 10, maxBadge: 99 },
  { id: 'icon_news',     name: '新闻',   artId: 'icon_news',     fallbackColor: '#2B2B33', fallbackGlyph: '📰', spawnWeight: 5,  maxBadge: 40 },
  { id: 'icon_shop',     name: '购物',   artId: 'icon_shop',     fallbackColor: '#FF3B30', fallbackGlyph: '🛍️', spawnWeight: 3,  maxBadge: 20 },
  { id: 'icon_game',     name: '游戏',   artId: 'icon_game',     fallbackColor: '#7C4DFF', fallbackGlyph: '🎮', spawnWeight: 5,  maxBadge: 30 },
  { id: 'icon_video',    name: '视频',   artId: 'icon_video',    fallbackColor: '#FF6B6B', fallbackGlyph: '📺', spawnWeight: 6,  maxBadge: 25 },
  { id: 'icon_music',    name: '音乐',   artId: 'icon_music',    fallbackColor: '#26C6A6', fallbackGlyph: '🎵', spawnWeight: 4,  maxBadge: 30 },
  { id: 'icon_photo',    name: '相册',   artId: 'icon_photo',    fallbackColor: '#5B8DEF', fallbackGlyph: '📷', spawnWeight: 4,  maxBadge: 20 },
  { id: 'icon_map',      name: '地图',   artId: 'icon_map',      fallbackColor: '#43A047', fallbackGlyph: '🗺️', spawnWeight: 2,  maxBadge: 10 },
  { id: 'icon_weather',  name: '天气',   artId: 'icon_weather',  fallbackColor: '#FFB300', fallbackGlyph: '☀️', spawnWeight: 2,  maxBadge: 5  },
  { id: 'icon_calendar', name: '日历',   artId: 'icon_calendar', fallbackColor: '#EF5350', fallbackGlyph: '📅', spawnWeight: 3,  maxBadge: 15 },
];
