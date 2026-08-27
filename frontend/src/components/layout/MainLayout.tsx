import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MemberPanel } from './MemberPanel';
import { ThreadDrawer } from '../chat/ThreadDrawer';
import { useUIStore } from '../../stores/uiStore';
import './MainLayout.css';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const mobileView = useUIStore((s) => s.mobileView);

  return (
    <div className={`main-layout main-layout--mobile-${mobileView}`}>
      <Sidebar />
      <div className="main-layout__center">
        <Header />
        <main className="main-layout__content">{children}</main>
      </div>
      <MemberPanel />
      <ThreadDrawer />
    </div>
  );
}
