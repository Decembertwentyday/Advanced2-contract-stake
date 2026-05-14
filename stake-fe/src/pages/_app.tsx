/**
 * Next.js 应用根组件：每个页面渲染前都会经过这里。
 *
 * Provider 嵌套顺序（由内到外理解）：
 * - `Web3Provider`：最内层，提供 `readProvider` / `signer` / `connect`，业务 hooks 依赖它。
 * - `Layout`：壳（顶栏 + 页脚 + main 槽位）。
 * - `ThemeProvider`：MUI 主题；与 Tailwind 并存。
 * - `ToastContainer`：全局 `react-toastify` 挂载点，任意子组件可 `toast.success(...)`。
 */
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { ThemeProvider } from '@mui/material/styles';
import { Web3Provider } from '../providers/Web3Provider';
import theme from '../utils/theme';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Head from 'next/head';
import Layout from '../components/Layout';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Meta Node Stake</title>
        <meta content="MetaNode Stake dApp (ethers)" name="description" />
        <link href="/favicon.ico" rel="icon" />
      </Head>
      <ThemeProvider theme={theme}>
        <Web3Provider>
          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
            toastClassName="custom-toast"
          />
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </Web3Provider>
      </ThemeProvider>
    </>
  );
}

export default MyApp;
