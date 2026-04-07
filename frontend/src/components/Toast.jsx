import { useEffect, useState } from 'react';

export default function Toast({ toast, onDismiss }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const hideTimer = setTimeout(() => {
      setLeaving(true);
      setTimeout(onDismiss, 260);
    }, 2800);
    return () => clearTimeout(hideTimer);
  }, [toast.id, onDismiss]);

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  return (
    <div className={`toast toast-${toast.type} ${leaving ? 'toast-out' : ''}`}>
      <span>{icons[toast.type] || 'ℹ'}</span>
      <span>{toast.message}</span>
    </div>
  );
}
