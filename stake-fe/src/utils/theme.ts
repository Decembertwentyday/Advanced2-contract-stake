/**
 * MUI 主题：颜色、字体（next/font 加载的 Roboto）。
 *
 * 本项目的按钮/卡片大量用 Tailwind；ThemeProvider 仍包裹在 _app 中，
 * 以便少量 MUI 组件或未来扩展时样式一致。
 */
import { Roboto } from 'next/font/google';
import { createTheme } from '@mui/material/styles';
import { red } from '@mui/material/colors';

export const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const theme = createTheme({
  palette: {
    primary: { main: '#556cd6' },
    secondary: { main: '#19857b' },
    error: { main: red.A400 },
  },
  typography: {
    fontFamily: roboto.style.fontFamily,
  },
});

export default theme;
