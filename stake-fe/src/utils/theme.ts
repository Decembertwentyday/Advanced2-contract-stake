/**
 * MUI 主题：供 _app.tsx 的 ThemeProvider 使用。
 * 主 UI 是 Tailwind；本文件保证若使用 @mui/material 组件时颜色/字体一致。
 */
import { Roboto } from 'next/font/google'; // Next 优化字体加载
import { createTheme } from '@mui/material/styles';
import { red } from '@mui/material/colors';

export const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap', // 字体加载期间先用系统字体，减少闪烁
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
