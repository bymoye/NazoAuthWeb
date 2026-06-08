import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  AtSign,
  Building2,
  CircleSlash,
  Link2,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { buildAuthRedirectWithNext, buildCurrentPath } from '../auth/next';
import { useAuth } from '../auth/useAuth';
import { API_BASE_URL, ApiError, apiFetch } from '../lib/api';
import { resolveAvatarUrl } from '../lib/avatar';
import type { ConsentView } from '../types/auth';
import './Consent.css';

type ScopeMeta = {
  title: string;
  description: string;
  level: 'basic' | 'sensitive';
};

const SCOPE_META: Record<string, ScopeMeta> = {
  openid: {
    title: '账户唯一标识',
    description: '用于标识你在 NazoAuth 中的账号主体。',
    level: 'basic',
  },
  profile: {
    title: '公开资料信息',
    description: '允许读取昵称、头像等基础资料字段。',
    level: 'basic',
  },
  email: {
    title: '邮箱地址',
    description: '允许读取与你账号绑定的邮箱地址。',
    level: 'sensitive',
  },
  offline_access: {
    title: '离线访问权限',
    description: '允许客户端在你离线时刷新会话，需谨慎授予。',
    level: 'sensitive',
  },
  'nazo_admin:read': {
    title: '管理读权限',
    description: '允许访问平台管理读接口，适用于受控后台工具。',
    level: 'sensitive',
  },
  'nazo_admin:write': {
    title: '管理写权限',
    description: '允许调用管理写接口，影响范围较高。',
    level: 'sensitive',
  },
};

function resolveScopeMeta(scope: string): ScopeMeta {
  if (scope in SCOPE_META) {
    return SCOPE_META[scope];
  }
  return {
    title: scope,
    description: '该权限由接入方自定义声明，请确认来源可信后再授权。',
    level: 'sensitive',
  };
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return '加载授权信息失败，请重新发起授权流程。';
}

export default function Consent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [consentView, setConsentView] = useState<ConsentView | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const requestId = useMemo(
    () => new URLSearchParams(location.search).get('request_id')?.trim() ?? '',
    [location.search]
  );

  useEffect(() => {
    if (!requestId) {
      setConsentView(null);
      setErrorMsg('缺少 request_id，无法继续授权。');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setErrorMsg('');
    setConsentView(null);

    const loadConsentView = async () => {
      try {
        const payload = await apiFetch<ConsentView>(
          `/authorize/consent?request_id=${encodeURIComponent(requestId)}`
        );
        if (!active) {
          return;
        }
        setConsentView(payload);
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          navigate(buildAuthRedirectWithNext(buildCurrentPath(window.location)), {
            replace: true,
          });
          return;
        }
        setErrorMsg(resolveErrorMessage(error));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadConsentView();
    return () => {
      active = false;
    };
  }, [navigate, requestId]);

  const decisionEndpoint = `${API_BASE_URL}/authorize/decision`;
  const scopeItems = (consentView?.scopes ?? []).map((scope) => ({
    scope,
    meta: resolveScopeMeta(scope),
  }));
  const userTag = (user?.email || user?.display_name || 'nazo_user')
    .split('@')[0]
    .replace(/\s+/g, '_')
    .toLowerCase();
  const userName = user?.display_name || user?.email?.split('@')[0] || '当前账号';
  const userAvatar = resolveAvatarUrl(user?.avatar_url);

  return (
    <motion.div
      className="page-transition-wrap consent-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="consent-bg-grid" aria-hidden="true" />

      <div className="consent-shell">
        <section className="consent-user-strip glass">
          <div className="consent-user-avatar-wrap">
            {user ? (
              <img src={userAvatar} alt="当前用户头像" className="consent-user-avatar" />
            ) : (
              <UserRound size={18} />
            )}
          </div>
          <div className="consent-user-main">
            <strong>{userName}</strong>
            <p>
              <AtSign size={14} />
              <span>以 @{userTag} 的身份授权</span>
            </p>
          </div>
        </section>

        <section className="consent-card glass">
          <header className="consent-head">
            <span className="consent-icon">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h1>确认授权</h1>
              <p>请确认是否允许该应用访问你的 NazoAuth 账号数据。</p>
            </div>
          </header>

          {loading && <div className="consent-status">正在加载授权请求...</div>}

          {!loading && errorMsg && (
            <div className="consent-error">
              <AlertTriangle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {!loading && consentView && (
            <>
              <section className="consent-app-box">
                <div className="consent-app-title">请求来源</div>
                <div className="consent-app-meta">
                  <div className="consent-app-meta-item">
                    <span className="consent-app-meta-icon">
                      <Building2 size={14} />
                    </span>
                    <div>
                      <strong>{consentView.client_name}</strong>
                      <p>应用名称</p>
                    </div>
                  </div>
                  <div className="consent-app-meta-item">
                    <span className="consent-app-meta-icon">
                      <Link2 size={14} />
                    </span>
                    <div>
                      <strong>{consentView.redirect_uri}</strong>
                      <p>Redirect URI</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="consent-scope-box">
                <div className="consent-block-title">
                  <LockKeyhole size={16} />
                  <span>本次请求的权限</span>
                </div>
                <ul className="consent-scope-list">
                  {scopeItems.map((item) => (
                    <li
                      key={item.scope}
                      className={`consent-scope-item ${
                        item.meta.level === 'sensitive' ? 'sensitive' : 'basic'
                      }`}
                    >
                      <div className="scope-line-1">{item.meta.title}</div>
                      <div className="scope-line-2">{item.meta.description}</div>
                      <code>{item.scope}</code>
                    </li>
                  ))}
                </ul>
              </section>

              <form action={decisionEndpoint} method="post" className="consent-actions">
                <input type="hidden" name="request_id" value={consentView.request_id} />
                <input
                  type="hidden"
                  name="csrf_token"
                  value={consentView.csrf_token || ''}
                />
                <button type="submit" name="decision" value="deny" className="consent-btn deny">
                  <CircleSlash size={16} />
                  <span>拒绝</span>
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  className="consent-btn approve"
                >
                  <span>同意并继续</span>
                  <ArrowRight size={16} />
                </button>
              </form>
            </>
          )}

          {!loading && !consentView && (
            <div className="consent-fallback">
              <Link to="/auth" className="btn-primary">
                返回登录
              </Link>
            </div>
          )}
        </section>

        <div className="consent-powered">
          <span>Secured by NazoAuth</span>
        </div>
      </div>
    </motion.div>
  );
}
