import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Mail, Lock, Shield, ArrowRight } from 'lucide-react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveSafeNextFromSearch } from '../auth/next';
import { useAuth } from '../auth/useAuth';
import CaptchaModal from '../components/CaptchaModal';
import { apiFetch } from '../lib/api';
import type { CaptchaConfig } from '../types/auth';
import './Auth.css';

type AuthState = 'login' | 'register' | 'forgot';
type ProtectedAction = 'login' | 'send-code';

const DEFAULT_CAPTCHA_CONFIG: CaptchaConfig = {
  turnstile_enabled: false,
  turnstile_site_key: null,
  registration_enabled: true,
};

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function normalizeCaptchaConfig(value: unknown): CaptchaConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_CAPTCHA_CONFIG;
  }
  const candidate = value as Partial<CaptchaConfig>;
  return {
    turnstile_enabled: candidate.turnstile_enabled === true,
    turnstile_site_key:
      typeof candidate.turnstile_site_key === 'string' ? candidate.turnstile_site_key : null,
    registration_enabled: candidate.registration_enabled !== false,
  };
}

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshSession } = useAuth();
  const nextAfterLogin = useMemo(
    () => resolveSafeNextFromSearch(location.search),
    [location.search]
  );

  const [authState, setAuthState] = useState<AuthState>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [captchaConfig, setCaptchaConfig] =
    useState<CaptchaConfig>(DEFAULT_CAPTCHA_CONFIG);
  const [captchaConfigLoading, setCaptchaConfigLoading] = useState(true);
  const [captchaModalOpen, setCaptchaModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ProtectedAction | null>(null);
  const [autoCaptchaRunning, setAutoCaptchaRunning] = useState(false);
  const loginTurnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const loginCaptchaPromiseRef = useRef<{
    resolve: (token: string) => void;
    reject: (reason: Error) => void;
  } | null>(null);

  const captchaEnabled =
    captchaConfig.turnstile_enabled && Boolean(captchaConfig.turnstile_site_key);

  const clearLoginCaptchaPromise = () => {
    loginCaptchaPromiseRef.current = null;
  };

  const requestLoginTurnstileToken = (): Promise<string> => {
    if (!captchaEnabled || !captchaConfig.turnstile_site_key) {
      return Promise.resolve('');
    }
    if (!loginTurnstileRef.current) {
      return Promise.reject(new Error('安全组件加载中，请稍后重试。'));
    }
    if (loginCaptchaPromiseRef.current) {
      return Promise.reject(new Error('安全校验进行中，请稍后重试。'));
    }
    return new Promise<string>((resolve, reject) => {
      loginCaptchaPromiseRef.current = { resolve, reject };
      try {
        loginTurnstileRef.current?.execute();
      } catch {
        clearLoginCaptchaPromise();
        reject(new Error('安全校验初始化失败，请稍后重试。'));
      }
    });
  };

  useEffect(() => {
    let active = true;
    const loadCaptchaConfig = async () => {
      try {
        const config = await apiFetch<unknown>('/auth/captcha-config');
        if (active) {
          setCaptchaConfig(normalizeCaptchaConfig(config));
        }
      } catch {
        if (active) {
          setCaptchaConfig(DEFAULT_CAPTCHA_CONFIG);
        }
      } finally {
        if (active) {
          setCaptchaConfigLoading(false);
        }
      }
    };

    void loadCaptchaConfig();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setEmail('');
    setPassword('');
    setCode('');
    setErrorMsg('');
    setSuccessMsg('');
    setCountdown(0);
    setPendingAction(null);
    setCaptchaModalOpen(false);
    setAutoCaptchaRunning(false);
    if (loginCaptchaPromiseRef.current) {
      loginCaptchaPromiseRef.current.reject(new Error('安全校验已取消，请重试。'));
      clearLoginCaptchaPromise();
    }
  }, [authState]);

  useEffect(
    () => () => {
      if (loginCaptchaPromiseRef.current) {
        loginCaptchaPromiseRef.current.reject(new Error('页面已离开，请重试。'));
        clearLoginCaptchaPromise();
      }
    },
    []
  );

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((value) => value - 1);
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [countdown]);

  const variants: Variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 50 : -50,
      opacity: 0,
      scale: 0.95,
    }),
  };

  const currentDirection = authState === 'login' ? -1 : 1;

  const performProtectedAction = async (
    action: ProtectedAction,
    turnstileToken: string | null
  ) => {
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (action === 'send-code') {
        await apiFetch<{ success: boolean; message: string }>('/auth/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            turnstile_token: turnstileToken,
          }),
        });
        setSuccessMsg('验证码已发送，请查收邮箱。');
        setCountdown(60);
        return;
      }

      await apiFetch<{ session_id: string; expires_in: number }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          turnstile_token: turnstileToken,
        }),
      });

      await refreshSession();
      if (nextAfterLogin) {
        window.location.href = nextAfterLogin;
        return;
      }
      setSuccessMsg('登录成功，正在进入个人中心...');
      navigate('/profile', { replace: true });
    } catch (error) {
      setErrorMsg(
        resolveErrorMessage(
          error,
          action === 'send-code' ? '验证码发送失败，请稍后重试。' : '登录失败，请稍后重试。'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const triggerProtectedAction = (action: ProtectedAction) => {
    if (captchaConfigLoading) {
      setErrorMsg('安全组件加载中，请稍后重试。');
      return;
    }

    if (!captchaEnabled) {
      void performProtectedAction(action, null);
      return;
    }

    if (action === 'login') {
      setAutoCaptchaRunning(true);
      void requestLoginTurnstileToken()
        .then((token) => performProtectedAction(action, token))
        .catch((error: unknown) => {
          setErrorMsg(resolveErrorMessage(error, '登录安全校验失败，请稍后重试。'));
        })
        .finally(() => {
          setAutoCaptchaRunning(false);
        });
      return;
    }

    setPendingAction(action);
    setCaptchaModalOpen(true);
  };

  const handleSendCode = () => {
    if (!email) {
      setErrorMsg('请先输入邮箱地址。');
      return;
    }
    if (countdown > 0) {
      return;
    }
    triggerProtectedAction('send-code');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (authState === 'register') {
      if (!captchaConfig.registration_enabled) {
        setErrorMsg('注册功能当前未开放，请联系管理员。');
        return;
      }
      if (!email || !code || !password) {
        setErrorMsg('请填写邮箱、验证码和密码。');
        return;
      }

      setSubmitting(true);
      try {
        await apiFetch<{ id: string; email: string }>('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            verification_code: code,
            password,
          }),
        });
        setSuccessMsg('账号已创建，请继续登录。');
        window.setTimeout(() => {
          setAuthState('login');
        }, 1200);
      } catch (error) {
        setErrorMsg(resolveErrorMessage(error, '账号创建失败，请稍后重试。'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (authState === 'login') {
      if (!email || !password) {
        setErrorMsg('请填写邮箱和密码。');
        return;
      }
      triggerProtectedAction('login');
      return;
    }

    setErrorMsg('找回密码流程尚未开放，请先联系管理员。');
  };

  const handleCaptchaVerified = (token: string) => {
    const action = pendingAction;
    setCaptchaModalOpen(false);
    setPendingAction(null);
    if (!action) {
      return;
    }
    void performProtectedAction(action, token);
  };

  return (
    <motion.div
      className="page-transition-wrap auth-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="auth-background" aria-hidden="true">
        <div className="auth-grid"></div>
      </div>

      <div className="auth-container">
        <div className="auth-card glass">
          <div className="auth-header">
            <img src="/icons/site-icon-64x64.png" alt="NazoAuth" className="auth-brand-icon" />
            <h2>
              {authState === 'login' && '登录 NazoAuth'}
              {authState === 'register' && '创建账号'}
              {authState === 'forgot' && '找回密码'}
            </h2>
            <p className="auth-subtitle">
              {authState === 'login' && '继续完成登录、授权或账号管理。'}
              {authState === 'register' && '通过验证码与密码创建账号'}
              {authState === 'forgot' && '自助找回暂未开放，请联系管理员。'}
            </p>
          </div>

          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="auth-alert error"
              >
                {errorMsg}
              </motion.div>
            )}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="auth-alert success"
              >
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="auth-form-wrapper">
            <AnimatePresence mode="wait" custom={currentDirection}>
              <motion.div
                key={authState}
                custom={currentDirection}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                className="form-animator"
              >
                <form className="auth-form" onSubmit={handleSubmit}>
                  {authState === 'register' ? (
                    <>
                      <div className="input-group">
                        <div className="input-icon">
                          <Mail size={18} />
                        </div>
                        <input
                          type="email"
                          className="glass-input code-input-with-btn"
                          placeholder="邮箱地址"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                        <button
                          type="button"
                          className="send-code-btn"
                          onClick={handleSendCode}
                          disabled={countdown > 0 || submitting || autoCaptchaRunning}
                        >
                          {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                        </button>
                      </div>
                      <div className="input-group">
                        <div className="input-icon">
                          <Shield size={18} />
                        </div>
                        <input
                          type="text"
                          className="glass-input"
                          placeholder="邮箱验证码"
                          value={code}
                          onChange={(event) => setCode(event.target.value)}
                        />
                      </div>
                      <div className="input-group">
                        <div className="input-icon">
                          <Lock size={18} />
                        </div>
                        <input
                          type="password"
                          className="glass-input"
                          placeholder="设置密码"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                      </div>
                    </>
                  ) : authState === 'login' ? (
                    <>
                      <div className="input-group">
                        <div className="input-icon">
                          <Mail size={18} />
                        </div>
                        <input
                          type="email"
                          className="glass-input"
                          placeholder="邮箱地址"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                      </div>
                      <div className="input-group">
                        <div className="input-icon">
                          <Lock size={18} />
                        </div>
                        <input
                          type="password"
                          className="glass-input"
                          placeholder="密码"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                      </div>
                      <div className="auth-options">
                        <span className="text-link" onClick={() => setAuthState('forgot')}>
                          忘记密码？
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="auth-help-text">
                      请联系管理员完成密码重置。自助找回能力开放后会显示在这里。
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn-primary w-full mt-4"
                    disabled={submitting || autoCaptchaRunning}
                  >
                    <span>
                      {authState === 'login' &&
                        (autoCaptchaRunning ? '安全校验中...' : '登录')}
                      {authState === 'register' && '创建账号'}
                      {authState === 'forgot' && '联系管理员'}
                    </span>
                    <ArrowRight size={18} />
                  </button>
                </form>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="auth-footer">
            {authState === 'login' ? (
              <p>
                没有账号？
                <span
                  className="text-link font-bold text-cta"
                  onClick={() => setAuthState('register')}
                >
                  创建账号
                </span>
              </p>
            ) : (
              <p>
                已有账号？
                <span
                  className="text-link font-bold text-secondary"
                  onClick={() => setAuthState('login')}
                >
                  返回登录
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {captchaEnabled && captchaConfig.turnstile_site_key && (
        <div className="turnstile-auto-hidden" aria-hidden="true">
          <Turnstile
            ref={loginTurnstileRef}
            siteKey={captchaConfig.turnstile_site_key}
            options={{
              theme: 'dark',
              execution: 'execute',
              appearance: 'execute',
              refreshExpired: 'auto',
              refreshTimeout: 'auto',
            }}
            onSuccess={(token) => {
              const pending = loginCaptchaPromiseRef.current;
              if (!pending) {
                return;
              }
              clearLoginCaptchaPromise();
              pending.resolve(token);
            }}
            onExpire={() => {
              const pending = loginCaptchaPromiseRef.current;
              if (!pending) {
                return;
              }
              clearLoginCaptchaPromise();
              pending.reject(new Error('登录安全校验已过期，请重试。'));
            }}
            onError={() => {
              const pending = loginCaptchaPromiseRef.current;
              if (!pending) {
                return;
              }
              clearLoginCaptchaPromise();
              pending.reject(new Error('登录安全校验失败，请稍后重试。'));
            }}
          />
        </div>
      )}

      {captchaEnabled && captchaConfig.turnstile_site_key && captchaModalOpen && (
        <CaptchaModal
          siteKey={captchaConfig.turnstile_site_key}
          title="执行安全验证"
          actionLabel="开始验证"
          disabled={submitting}
          onClose={() => {
            setCaptchaModalOpen(false);
            setPendingAction(null);
          }}
          onVerified={handleCaptchaVerified}
        />
      )}
    </motion.div>
  );
}
