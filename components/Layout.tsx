
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  onHomeClick?: () => void;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, onHomeClick, title = "Frontier" }) => {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 h-14 flex items-center px-6 justify-between">
        <div 
          onClick={onHomeClick} 
          className="font-semibold tracking-tight text-lg cursor-pointer hover:opacity-70 transition-opacity"
        >
          {title}
        </div>
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-500">
            <span className="cursor-default">Research</span>
            <span className="cursor-default">Labs</span>
            <span className="cursor-default">Archive</span>
          </nav>
        </div>
      </header>
      <main className="flex-1 relative">
        {children}
      </main>
    </div>
  );
};

export default Layout;
