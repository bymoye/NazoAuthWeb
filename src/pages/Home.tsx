import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  ServerCog,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import './Home.css';

const endpointRows = [
  ['Authorization', '/authorize'],
  ['Token', '/token'],
  ['UserInfo', '/userinfo'],
  ['JWKS', '/jwks.json'],
];

const controls = [
  {
    icon: Fingerprint,
    title: '账户登录',
    description: '邮箱、密码、验证码和 Turnstile 风控接入同一条登录链路。',
  },
  {
    icon: LockKeyhole,
    title: '授权确认',
    description: '外部系统请求 scope 时，用户在这里确认授权范围。',
  },
  {
    icon: ServerCog,
    title: '应用接入',
    description: '用户提交 OAuth 客户端接入申请，管理员审批并发放凭据。',
  },
];

export default function Home() {
  const { user } = useAuth();
  const canAccessAdmin = user?.role === 'admin' && user.admin_level >= 1;

  return (
    <motion.div
      className="page-transition-wrap home-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
    >
      <section className="home-shell container">
        <div className="home-hero">
          <div className="home-hero-copy">
            <div className="home-kicker">
              <span className="status-dot" />
              accounts-test.nazo.run
            </div>
            <h1>NazoAuth 账户与授权入口</h1>
            <p>
              面向外部应用的 OAuth/OIDC 登录、授权同意和客户端接入工作台。
              用户在这里登录，应用在这里请求授权，管理员在这里管理接入边界。
            </p>
            <div className="home-actions">
              <Link to={user ? '/profile' : '/auth'} className="btn-primary">
                {user ? <UserRound size={18} /> : <KeyRound size={18} />}
                <span>{user ? '打开个人中心' : '登录账号'}</span>
              </Link>
              <Link to="/docs" className="btn-secondary">
                <BookOpen size={18} />
                <span>查看接入文档</span>
              </Link>
              {canAccessAdmin && (
                <Link to="/admin" className="btn-secondary">
                  <LayoutDashboard size={18} />
                  <span>管理后台</span>
                </Link>
              )}
            </div>
          </div>

          <aside className="gateway-panel" aria-label="NazoAuth service status">
            <div className="gateway-panel-head">
              <img src="/icons/site-icon-64x64.png" alt="NazoAuth" />
              <div>
                <strong>NazoAuth</strong>
                <span>OIDC issuer gateway</span>
              </div>
            </div>
            <div className="gateway-meter">
              <span>Current surface</span>
              <strong>{user ? 'signed in' : 'public'}</strong>
            </div>
            <div className="endpoint-list">
              {endpointRows.map(([label, path]) => (
                <div className="endpoint-row" key={path}>
                  <span>{label}</span>
                  <code>{path}</code>
                </div>
              ))}
            </div>
            <Link className="gateway-panel-link" to="/profile?tab=access-requests">
              <span>申请接入应用</span>
              <ArrowRight size={16} />
            </Link>
          </aside>
        </div>

        <div className="home-control-grid">
          {controls.map((item) => {
            const Icon = item.icon;
            return (
              <article className="control-card" key={item.title}>
                <Icon size={22} />
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>

        <section className="home-proof-strip">
          <div>
            <BadgeCheck size={18} />
            <span>标准 OAuth/OIDC 入口</span>
          </div>
          <div>授权码 + PKCE</div>
          <div>用户授权记录</div>
          <div>管理员审批</div>
        </section>
      </section>
    </motion.div>
  );
}
