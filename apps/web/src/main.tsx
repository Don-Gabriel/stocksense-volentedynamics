import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/api';
import { Layout } from './components/Layout';
import { AuthPage } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Operations, OperationDetail } from './pages/Operations';
import { Products } from './pages/Products';
import { Stock } from './pages/Stock';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Profile } from './pages/Profile';
import { Button, Empty } from './components/ui';
import './styles.css';
import './form-layout.css';
import '@fontsource-variable/inter';
import './usability.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage initial="register" />} />
          <Route path="/forgot-password" element={<AuthPage initial="forgot" />} />
          <Route path="/reset-password" element={<AuthPage initial="reset" />} />
          <Route path="/verify-email" element={<AuthPage initial="verify" />} />
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="stock" element={<Stock />} />
            <Route path="operations" element={<Operations />} />
            <Route path="operations/:id" element={<OperationDetail />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
            <Route
              path="*"
              element={
                <Empty
                  title="This page isn’t on the shelf"
                  text="Head back to your inventory overview."
                  action={
                    <Button asChild>
                      <Link to="/">Go to overview</Link>
                    </Button>
                  }
                />
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
