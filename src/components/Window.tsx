import React, { useRef, useEffect, useCallback } from 'react';

interface Props {
  id: string;
  title: string;
  icon: string;
  children: React.ReactNode;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  zIndex: number;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onFocus: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}

export default function Window({
  id, title, icon, children,
  x, y, width, height,
  minimized, maximized, focused, zIndex,
  onClose, onMinimize, onMaximize, onFocus, onMove,
}: Props) {
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls')) return;
    if (maximized) return;
    dragging.current = true;
    offset.current = { x: e.clientX - x, y: e.clientY - y };
    onFocus(id);
    e.preventDefault();
  }, [x, y, id, maximized, onFocus]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const newX = Math.max(0, e.clientX - offset.current.x);
      const newY = Math.max(0, e.clientY - offset.current.y);
      onMove(id, newX, newY);
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [id, onMove]);

  const style: React.CSSProperties = maximized
    ? { top: 0, left: 0, width: '100%', height: 'calc(100% - 52px)', zIndex, borderRadius: 0 }
    : { top: y, left: x, width, height, zIndex };

  return (
    <div
      className={`window ${focused ? 'focused' : ''} ${minimized ? 'minimized' : ''} ${maximized ? 'maximized' : ''}`}
      style={style}
      onMouseDown={() => onFocus(id)}
    >
      <div className="window-titlebar" onMouseDown={onTitleMouseDown}>
        <div className="window-title">
          <span className="window-title-icon">{icon}</span>
          {title}
        </div>
        <div className="window-controls">
          <button className="wbtn minimize" onClick={(e) => { e.stopPropagation(); onMinimize(id); }} title="Minimize" />
          <button className="wbtn maximize" onClick={(e) => { e.stopPropagation(); onMaximize(id); }} title="Maximize" />
          <button className="wbtn close"    onClick={(e) => { e.stopPropagation(); onClose(id); }}    title="Close" />
        </div>
      </div>
      <div className="window-body">
        {children}
      </div>
    </div>
  );
}
