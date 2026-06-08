import { useRef, useState } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import './CaptchaModal.css';

interface CaptchaModalProps {
  siteKey: string;
  title: string;
  actionLabel: string;
  disabled?: boolean;
  onClose: () => void;
  onVerified: (token: string) => void;
}

export default function CaptchaModal({
  siteKey,
  title,
  actionLabel,
  disabled = false,
  onClose,
  onVerified,
}: CaptchaModalProps) {
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState('');
  const [running, setRunning] = useState(false);

  const handleStart = () => {
    setErrorMsg('');
    setRunning(true);
    turnstileRef.current?.execute();
  };

  return (
    <div className="captcha-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="captcha-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="人机验证"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{title}</h3>
        <p>请手动完成人机验证后继续。</p>

        <div className="captcha-widget-wrap">
          <Turnstile
            ref={turnstileRef}
            siteKey={siteKey}
            options={{
              theme: 'dark',
              execution: 'execute',
              appearance: 'execute',
              refreshExpired: 'manual',
              refreshTimeout: 'manual',
            }}
            onSuccess={(token) => {
              setRunning(false);
              onVerified(token);
            }}
            onExpire={() => {
              setRunning(false);
              setErrorMsg('验证码已过期，请重新执行验证。');
            }}
            onError={() => {
              setRunning(false);
              setErrorMsg('验证码校验失败，请重试。');
            }}
          />
        </div>

        {errorMsg && <div className="captcha-modal-error">{errorMsg}</div>}

        <div className="captcha-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleStart}
            disabled={disabled || running}
          >
            {running ? '验证中...' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
