import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { buildAuthRedirectWithNext } from '../auth/next';
import { useAuth } from '../auth/useAuth';
import { ApiError, apiFetch } from '../lib/api';
import type { ClientCredentialDeliveryResponse } from '../types/auth';
import './Delivery.css';

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

type DeliveryValueItem = {
  label: string;
  value: string;
  sensitive?: boolean;
};

export default function Delivery() {
  const location = useLocation();
  const { user, loading, sessionChecked } = useAuth();

  const [loadingDelivery, setLoadingDelivery] = useState(false);
  const [deliveryPayload, setDeliveryPayload] =
    useState<ClientCredentialDeliveryResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const consumedTokenRef = useRef<string>('');

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const deliveryToken = (query.get('token') || '').trim();

  useEffect(() => {
    if (!user || !deliveryToken) {
      return;
    }
    if (consumedTokenRef.current === deliveryToken) {
      return;
    }
    consumedTokenRef.current = deliveryToken;
    setErrorMsg('');
    setDismissed(false);
    setLoadingDelivery(true);

    void (async () => {
      try {
        const payload = await apiFetch<ClientCredentialDeliveryResponse>(
          `/auth/me/access-delivery?token=${encodeURIComponent(deliveryToken)}`
        );
        setDeliveryPayload(payload);
      } catch (error) {
        setDeliveryPayload(null);
        setErrorMsg(resolveErrorMessage(error, '一次性凭据读取失败。'));
      } finally {
        setLoadingDelivery(false);
      }
    })();
  }, [deliveryToken, user]);

  useEffect(() => {
    if (!copiedKey) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedKey(''), 1400);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch {
      setErrorMsg('复制失败，请手动复制。');
    }
  };

  const nextUrl = useMemo(
    () => `/delivery?token=${encodeURIComponent(deliveryToken)}`,
    [deliveryToken]
  );

  if (loading || (!user && !sessionChecked)) {
    return (
      <div className="container delivery-loading">正在验证会话并准备一次性凭据页面...</div>
    );
  }

  if (!user) {
    return <Navigate to={buildAuthRedirectWithNext(nextUrl)} replace />;
  }

  if (!deliveryToken) {
    return (
      <div className="container delivery-loading">
        <div className="glass delivery-state-card">
          <AlertTriangle size={20} />
          <h1>缺少凭据链接参数</h1>
          <p>当前 URL 不包含一次性 token，请使用邮件中的完整链接访问。</p>
          <Link to="/profile?tab=access-requests" className="btn-secondary">
            返回接入申请
          </Link>
        </div>
      </div>
    );
  }

  const kvItems: DeliveryValueItem[] = deliveryPayload
    ? [
        { label: 'Client ID', value: deliveryPayload.client_id },
        { label: 'Client Name', value: deliveryPayload.client_name },
        { label: 'Client Type', value: deliveryPayload.client_type },
        {
          label: 'Client Secret',
          value: deliveryPayload.client_secret || '（public 客户端无密钥）',
          sensitive: Boolean(deliveryPayload.client_secret),
        },
        {
          label: 'Auth Method',
          value: deliveryPayload.token_endpoint_auth_method,
        },
        {
          label: 'Redirect URIs',
          value: deliveryPayload.redirect_uris.join('\n') || '-',
        },
        {
          label: 'Scopes',
          value: deliveryPayload.scopes.join(' ') || '-',
        },
        {
          label: 'Grant Types',
          value: deliveryPayload.grant_types.join(' ') || '-',
        },
      ]
    : [];

  return (
    <motion.div
      className="page-transition-wrap delivery-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="delivery-bg-grid" />
      <div className="container delivery-container">
        <header className="glass delivery-header">
          <h1>一次性凭据页面</h1>
          <p>账号：{user.email}</p>
        </header>

        <section className="glass delivery-warning-card">
          <div className="delivery-warning-head">
            <ShieldAlert size={18} />
            <strong>高敏感信息 · 阅后即焚</strong>
          </div>
          <ul>
            <li>此链接仅可读取一次，读取后服务端立即销毁。</li>
            <li>请先复制并安全保存，再离开本页面。</li>
            <li>禁止截图、转发或在公共环境展示。</li>
          </ul>
        </section>

        {errorMsg && <div className="delivery-alert error">{errorMsg}</div>}

        {loadingDelivery && <div className="delivery-placeholder">正在读取一次性凭据...</div>}

        {!loadingDelivery && !errorMsg && deliveryPayload && !dismissed && (
          <>
            <section className="glass delivery-main-card">
              <div className="delivery-main-head">
                <strong>凭据详情</strong>
                <span>失效时间：{formatDateTime(deliveryPayload.expires_at)}</span>
              </div>
              <p className="delivery-read-once-note">{deliveryPayload.read_once_notice}</p>
              <div className="delivery-list">
                {kvItems.map((item) => {
                  const key = `${item.label}:${item.value}`;
                  const canCopy = item.value !== '-' && !item.value.includes('无密钥');
                  const copied = copiedKey === key;
                  return (
                    <article key={key} className={`delivery-item ${item.sensitive ? 'sensitive' : ''}`}>
                      <div className="delivery-item-head">
                        <span>{item.label}</span>
                        {canCopy && (
                          <button
                            type="button"
                            className="btn-secondary delivery-copy-btn"
                            onClick={() => void handleCopy(key, item.value)}
                          >
                            {copied ? <ClipboardCheck size={14} /> : <Clipboard size={14} />}
                            <span>{copied ? '已复制' : '复制'}</span>
                          </button>
                        )}
                      </div>
                      <pre>{item.value}</pre>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="delivery-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setDismissed(true);
                  setDeliveryPayload(null);
                }}
              >
                <EyeOff size={16} />
                <span>我已保存，立即隐藏敏感信息</span>
              </button>
              <Link to="/profile?tab=access-requests" className="btn-secondary">
                返回接入申请
              </Link>
            </section>
          </>
        )}

        {!loadingDelivery && !errorMsg && !deliveryPayload && dismissed && (
          <div className="glass delivery-state-card">
            <CheckCircle2 size={20} />
            <h2>敏感信息已隐藏</h2>
            <p>如需再次查看，请使用新的审批邮件链接（旧链接不可复用）。</p>
            <Link to="/profile?tab=access-requests" className="btn-secondary">
              返回接入申请
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}
