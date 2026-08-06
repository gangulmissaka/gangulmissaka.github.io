'use client';

export default function AuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
    >
      {/* Cyan — top right */}
      <div className="aurora-blob aurora-cyan" />
      {/* Purple — left centre */}
      <div className="aurora-blob aurora-purple" />
      {/* Blue — bottom left */}
      <div className="aurora-blob aurora-blue" />
      {/* Teal — bottom right */}
      <div className="aurora-blob aurora-teal" />
    </div>
  );
}
