/**
 * 全局入口：MUI Theme + Web3（ethers）+ Toast + Layout。
 * 合约读写依赖 Web3Provider 提供的 readProvider / signer。
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
