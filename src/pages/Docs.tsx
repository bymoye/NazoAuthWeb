import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  KeyRound,
  Network,
  Play,
  ShieldCheck,
  TerminalSquare,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { API_BASE_URL, ApiError, apiFetch } from '../lib/api';
import './Docs.css';

const sections = [
  { id: 'overview', label: '能力总览', icon: BookOpen },
  { id: 'flow', label: '登录与授权', icon: KeyRound },
  { id: 'metadata', label: '协议端点', icon: Network },
  { id: 'security', label: '安全边界', icon: ShieldCheck },
  { id: 'workbench', label: '用户与后台', icon: UsersRound },
  { id: 'interface-lab', label: '接口工作台', icon: ClipboardCheck },
  { id: 'deploy', label: '部署说明', icon: Wrench },
] as const;

type SectionId = (typeof sections)[number]['id'];
type CheckStatus = 'idle' | 'running' | 'ok' | 'error' | 'blocked';
type CheckResult = {
  status: CheckStatus;
  message: string;
};
type CheckKey =
  | 'health'
  | 'discovery'
  | 'oauthMetadata'
  | 'jwks'
  | 'captcha'
  | 'csrf'
  | 'me'
  | 'applications'
  | 'accessRequests'
  | 'adminUsers'
  | 'adminClients'
  | 'adminGrants'
  | 'adminAccessRequests'
  | 'scimConfig'
  | 'scimSchemas'
  | 'scimResourceTypes';

type BrowserCheck = {
  key: CheckKey;
  name: string;
  method: 'GET';
  path: string;
  group: '公开接口' | '登录后接口' | '管理员接口' | 'SCIM 元数据';
  auth?: 'user' | 'admin';
  mode: 'fetch' | 'api';
};

const discoveryUrl = `${API_BASE_URL}/.well-known/openid-configuration`;
const authorizeExample =
  `${API_BASE_URL}/authorize?response_type=code&client_id=your_client_id` +
  '&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&scope=openid%20profile' +
  '&state=random_state&nonce=random_nonce&code_challenge=base64url_sha256' +
  '&code_challenge_method=S256';
const tokenExample = `POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=returned_code&
redirect_uri=https://example.com/callback&
client_id=your_client_id&
code_verifier=original_pkce_verifier`;

const endpointGroups = [
  ['/.well-known/openid-configuration', 'OIDC 发现配置。客户端从这里读取 issuer、端点、算法和 scope。'],
  ['/.well-known/oauth-authorization-server', 'OAuth AS metadata。资源服务器和测试工具会读它。'],
  ['/authorize', '浏览器授权入口。外部应用把用户带到这里登录并确认授权。'],
  ['/authorize/consent', '授权同意页数据接口。前端 consent 页面会读取它。'],
  ['/authorize/decision', '同意或拒绝授权。只能由当前登录用户提交。'],
  ['/par', 'Pushed Authorization Request。高安全 profile 下由客户端服务端提交。'],
  ['/token', '令牌端点。授权码、refresh token、client_credentials 都在这里交换。'],
  ['/userinfo', '持有 access token 后读取用户信息。'],
  ['/jwks.json', '公钥集合。客户端和资源服务器用它验证 JWT。'],
  ['/introspect', '令牌检查端点。资源服务器用客户端认证调用。'],
  ['/revoke', '令牌撤销端点。用于撤销 refresh token 或相关授权。'],
  ['/fapi/resource', 'FAPI 资源端测试接口，用来验证 bearer、DPoP、mTLS 等边界。'],
  ['/logout', 'OIDC RP-Initiated Logout 入口。'],
  ['/auth/*', '登录、注册、验证码、CSRF、Passkey、MFA、个人资料和接入申请。'],
  ['/admin/*', '用户、客户端、授权记录和接入审批。仅管理员可用。'],
  ['/scim/v2/*', 'SCIM 配置、Schema、ResourceType 和用户同步接口。'],
];

const featureMatrix = [
  ['账号入口', '登录、注册、验证码、会话检查、退出登录、头像和资料编辑。'],
  ['授权确认', '展示应用名、redirect URI、请求的 scope，并处理同意或拒绝。'],
  ['个人中心', '查看授权过的应用，提交 OAuth 客户端接入申请，读取一次性凭据。'],
  ['后台管理', '管理用户、客户端、授权记录和接入申请。'],
  ['协议端点', 'Discovery、Authorization、Token、UserInfo、JWKS、PAR、Introspection、Revocation。'],
  ['安全能力', 'PKCE S256、CSRF、Turnstile、redirect URI 精确匹配、audience 绑定、sender-constrained metadata。'],
  ['外部同步', '提供 SCIM metadata 和用户同步接口，适合接企业目录。'],
  ['测试形态', '前端可以检查浏览器可安全调用的接口；OIDF 提交应通过后端任务 API 执行。'],
];

const browserChecks: BrowserCheck[] = [
  { key: 'health', name: '服务健康检查', method: 'GET', path: '/health', group: '公开接口', mode: 'fetch' },
  { key: 'discovery', name: 'OIDC 发现配置', method: 'GET', path: '/.well-known/openid-configuration', group: '公开接口', mode: 'fetch' },
  { key: 'oauthMetadata', name: 'OAuth AS metadata', method: 'GET', path: '/.well-known/oauth-authorization-server', group: '公开接口', mode: 'fetch' },
  { key: 'jwks', name: 'JWKS 公钥', method: 'GET', path: '/jwks.json', group: '公开接口', mode: 'fetch' },
  { key: 'captcha', name: '验证码配置', method: 'GET', path: '/auth/captcha-config', group: '公开接口', mode: 'api' },
  { key: 'csrf', name: 'CSRF token', method: 'GET', path: '/auth/csrf', group: '公开接口', mode: 'api' },
  { key: 'scimConfig', name: 'SCIM ServiceProviderConfig', method: 'GET', path: '/scim/v2/ServiceProviderConfig', group: 'SCIM 元数据', mode: 'fetch' },
  { key: 'scimSchemas', name: 'SCIM Schemas', method: 'GET', path: '/scim/v2/Schemas', group: 'SCIM 元数据', mode: 'fetch' },
  { key: 'scimResourceTypes', name: 'SCIM ResourceTypes', method: 'GET', path: '/scim/v2/ResourceTypes', group: 'SCIM 元数据', mode: 'fetch' },
  { key: 'me', name: '当前用户', method: 'GET', path: '/auth/me', group: '登录后接口', auth: 'user', mode: 'api' },
  { key: 'applications', name: '已授权应用', method: 'GET', path: '/auth/me/applications', group: '登录后接口', auth: 'user', mode: 'api' },
  { key: 'accessRequests', name: '我的接入申请', method: 'GET', path: '/auth/me/access-requests', group: '登录后接口', auth: 'user', mode: 'api' },
  { key: 'adminUsers', name: '用户列表', method: 'GET', path: '/admin/users?page=1&page_size=1', group: '管理员接口', auth: 'admin', mode: 'api' },
  { key: 'adminClients', name: '客户端列表', method: 'GET', path: '/admin/clients?page=1&page_size=1', group: '管理员接口', auth: 'admin', mode: 'api' },
  { key: 'adminGrants', name: '授权记录', method: 'GET', path: '/admin/grants?page=1&page_size=1', group: '管理员接口', auth: 'admin', mode: 'api' },
  { key: 'adminAccessRequests', name: '接入审批列表', method: 'GET', path: '/admin/access-requests?page=1&page_size=1', group: '管理员接口', auth: 'admin', mode: 'api' },
];

const serverSideOnly = [
  ['/token', '需要客户端认证、授权码或 refresh token。不要把客户端密钥放进浏览器。'],
  ['/par', '需要客户端认证。FAPI profile 下应由客户端服务端或测试任务调用。'],
  ['/introspect', '资源服务器接口，需要客户端认证和待检查 token。'],
  ['/revoke', '需要客户端认证和待撤销 token。'],
  ['/userinfo', '需要 access token。浏览器页面不应要求用户手动粘贴生产 token。'],
  ['/fapi/resource', '用于资源服务器边界测试，DPoP/mTLS 证明应由专门测试任务生成。'],
];

const oidfSteps = [
  '前端负责提交测试请求、展示运行状态和下载日志。',
  '后端任务 API 负责保存测试参数、调用 OIDF 套件、轮询结果和写入审计记录。',
  '浏览器不保存 client secret、私钥、OIDF 账号或 runner token。',
  '建议后端提供 /admin/oidf/runs、/admin/oidf/runs/{id}、/admin/oidf/runs/{id}/logs。',
];

function summarizePayload(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '接口已响应。';
  }
  const record = value as Record<string, unknown>;
  if (typeof record.issuer === 'string') {
    return `issuer: ${record.issuer}`;
  }
  if (Array.isArray(record.keys)) {
    return `keys: ${record.keys.length}`;
  }
  if (typeof record.total === 'number') {
    return `total: ${record.total}`;
  }
  if (typeof record.email === 'string') {
    return `user: ${record.email}`;
  }
  if (typeof record.csrf_token === 'string') {
    return 'csrf token 已刷新。';
  }
  if (typeof record.turnstile_enabled === 'boolean') {
    return `turnstile: ${record.turnstile_enabled ? 'enabled' : 'disabled'}`;
  }
  if (Array.isArray(record.Resources)) {
    return `resources: ${record.Resources.length}`;
  }
  return '接口已响应。';
}

function resolveCheckError(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return '请求失败。';
}

function statusText(result?: CheckResult): string {
  if (!result || result.status === 'idle') {
    return '未检查';
  }
  if (result.status === 'running') {
    return '检查中';
  }
  if (result.status === 'ok') {
    return '正常';
  }
  if (result.status === 'blocked') {
    return '需要权限';
  }
  return '失败';
}

export default function Docs() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SectionId>('overview');
  const [copied, setCopied] = useState('');
  const [checkResults, setCheckResults] = useState<Partial<Record<CheckKey, CheckResult>>>({});
  const [runningAll, setRunningAll] = useState(false);
  const canAccessAdmin = user?.role === 'admin' && user.admin_level >= 1;

  const groupedChecks = useMemo(() => {
    return browserChecks.reduce<Record<BrowserCheck['group'], BrowserCheck[]>>(
      (groups, item) => {
        groups[item.group].push(item);
        return groups;
      },
      {
        '公开接口': [],
        '登录后接口': [],
        '管理员接口': [],
        'SCIM 元数据': [],
      }
    );
  }, []);

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1200);
    } catch {
      setCopied('');
    }
  };

  const runCheck = async (check: BrowserCheck) => {
    if (check.auth === 'user' && !user) {
      setCheckResults((prev) => ({
        ...prev,
        [check.key]: { status: 'blocked', message: '登录后才能检查。' },
      }));
      return;
    }
    if (check.auth === 'admin' && !canAccessAdmin) {
      setCheckResults((prev) => ({
        ...prev,
        [check.key]: { status: 'blocked', message: '管理员登录后才能检查。' },
      }));
      return;
    }

    setCheckResults((prev) => ({
      ...prev,
      [check.key]: { status: 'running', message: '请求中...' },
    }));

    try {
      const payload =
        check.mode === 'api'
          ? await apiFetch<unknown>(check.path)
          : await fetch(`${API_BASE_URL}${check.path}`, {
              method: check.method,
              credentials: 'omit',
            }).then(async (response) => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              const contentType = response.headers.get('content-type') ?? '';
              if (contentType.includes('application/json')) {
                return response.json() as Promise<unknown>;
              }
              return response.text();
            });
      setCheckResults((prev) => ({
        ...prev,
        [check.key]: { status: 'ok', message: summarizePayload(payload) },
      }));
    } catch (error) {
      setCheckResults((prev) => ({
        ...prev,
        [check.key]: { status: 'error', message: resolveCheckError(error) },
      }));
    }
  };

  const runVisibleChecks = async () => {
    setRunningAll(true);
    try {
      for (const check of browserChecks) {
        await runCheck(check);
      }
    } finally {
      setRunningAll(false);
    }
  };

  const openAuthorizeExample = () => {
    window.open(authorizeExample, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      className="page-transition-wrap docs-page container future-page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2 }}
    >
      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="文档目录">
          <div className="sidebar-sticky">
            <h2 className="sidebar-title">NazoAuth 文档</h2>
            <nav className="sidebar-nav">
              {sections.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sidebar-link ${activeTab === item.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(item.id)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    <ChevronRight size={14} className="chevron" />
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="docs-content">
          {activeTab === 'overview' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">先看范围</span>
                <h1>这套前端负责账号、授权和接入管理</h1>
                <p>
                  NazoAuth Web 不是展示页。它承接用户登录、授权确认、个人中心、
                  客户端接入申请和管理员后台。协议判断仍在 NazoAuth 后端。
                </p>
              </div>
              <div className="matrix-table">
                {featureMatrix.map(([name, value]) => (
                  <div className="matrix-row" key={name}>
                    <strong>{name}</strong>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'flow' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">Authorization Code + PKCE</span>
                <h1>外部应用应这样接入登录</h1>
                <p>
                  应用生成 state、nonce 和 code challenge，把用户带到授权端点。
                  用户登录并确认授权后，应用后端用 code 和 code_verifier 换取 token。
                </p>
              </div>
              <div className="code-block-wrapper">
                <div className="code-header">
                  <span>授权请求</span>
                  <button
                    className="copy-btn"
                    title="复制示例"
                    type="button"
                    onClick={() => void copyText('authorize', authorizeExample)}
                  >
                    {copied === 'authorize' ? '已复制' : <Copy size={14} />}
                  </button>
                </div>
                <pre><code>{authorizeExample}</code></pre>
              </div>
              <div className="code-block-wrapper">
                <div className="code-header">
                  <span>换取 token</span>
                  <button
                    className="copy-btn"
                    title="复制示例"
                    type="button"
                    onClick={() => void copyText('token', tokenExample)}
                  >
                    {copied === 'token' ? '已复制' : <Copy size={14} />}
                  </button>
                </div>
                <pre><code>{tokenExample}</code></pre>
              </div>
              <div className="docs-card">
                <h2>浏览器里只做该做的事</h2>
                <p>
                  登录页和同意页可以在浏览器里完成。Client secret、私钥签名、
                  token introspection 和 OIDF runner token 不应进入前端。
                </p>
              </div>
            </section>
          )}

          {activeTab === 'metadata' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">端点清单</span>
                <h1>客户端先读发现配置，再发起协议请求</h1>
                <p>
                  不要在业务系统里写死 issuer、JWKs 或算法列表。发现配置才是当前环境的准确信息。
                </p>
              </div>
              <div className="code-block-wrapper">
                <div className="code-header">
                  <span>Discovery</span>
                  <button
                    className="copy-btn"
                    title="复制发现端点"
                    type="button"
                    onClick={() => void copyText('discovery', discoveryUrl)}
                  >
                    {copied === 'discovery' ? '已复制' : <TerminalSquare size={14} />}
                  </button>
                </div>
                <pre><code>GET {discoveryUrl}</code></pre>
              </div>
              <div className="endpoint-doc-grid">
                {endpointGroups.map(([path, desc]) => (
                  <article key={path} className="endpoint-doc-card">
                    <code>{path}</code>
                    <p>{desc}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'security' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">边界要清楚</span>
                <h1>前端只拿浏览器该拿的数据</h1>
                <p>
                  NazoAuth Web 可以检查公开 metadata 和当前登录会话，但不会把密钥、
                  私钥、access token 或 OIDF 凭据塞进浏览器。
                </p>
              </div>
              <div className="docs-card">
                <h2>只能在服务端或测试任务里做</h2>
                <div className="server-only-list">
                  {serverSideOnly.map(([path, reason]) => (
                    <div key={path} className="server-only-row">
                      <code>{path}</code>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="docs-card">
                <h2>OIDF 自动化测试入口</h2>
                <ul className="docs-list">
                  {oidfSteps.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {activeTab === 'workbench' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">日常操作</span>
                <h1>用户中心和后台是同一个接入流程的两面</h1>
                <p>
                  普通用户提交站点接入申请。管理员审核后创建客户端，密钥通过一次性链接交付。
                </p>
              </div>
              <div className="docs-two-col">
                <div className="docs-card">
                  <h2>用户中心</h2>
                  <ul className="docs-list">
                    <li>编辑显示昵称和头像。</li>
                    <li>查看已经授权过的应用。</li>
                    <li>提交 OAuth 客户端接入申请。</li>
                    <li>读取一次性客户端凭据投递链接。</li>
                  </ul>
                </div>
                <div className="docs-card">
                  <h2>管理后台</h2>
                  <ul className="docs-list">
                    <li>搜索、禁用、启用和提升用户。</li>
                    <li>创建、编辑、禁用客户端。</li>
                    <li>查看授权记录并撤销授权。</li>
                    <li>审批或拒绝客户端接入申请。</li>
                  </ul>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'interface-lab' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">真实请求</span>
                <h1>用当前前端检查 NazoAuth 接口</h1>
                <p>
                  这里会直接请求当前环境。公开接口可以立即检查；登录后接口需要当前会话；
                  管理员接口需要管理员权限。
                </p>
              </div>
              <div className="interface-toolbar">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={runningAll}
                  onClick={() => void runVisibleChecks()}
                >
                  <Play size={16} />
                  <span>{runningAll ? '检查中' : '检查可用接口'}</span>
                </button>
                <button type="button" className="btn-secondary" onClick={openAuthorizeExample}>
                  <KeyRound size={16} />
                  <span>打开授权请求示例</span>
                </button>
              </div>
              {Object.entries(groupedChecks).map(([group, checks]) => (
                <div className="interface-group" key={group}>
                  <h2>{group}</h2>
                  <div className="interface-grid">
                    {checks.map((check) => {
                      const result = checkResults[check.key];
                      return (
                        <article className="interface-card" key={check.key}>
                          <div>
                            <strong>{check.name}</strong>
                            <code>{check.method} {check.path}</code>
                          </div>
                          <span className={`interface-status ${result?.status ?? 'idle'}`}>
                            {statusText(result)}
                          </span>
                          <p>{result?.message ?? '还没有请求。'}</p>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={result?.status === 'running'}
                            onClick={() => void runCheck(check)}
                          >
                            <CheckCircle2 size={15} />
                            <span>检查</span>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="docs-card">
                <h2>关于 OIDF 提交</h2>
                <p>
                  前端已经留出工作台位置，但提交 OIDF 不能只靠浏览器完成。
                  下一步应在 NazoAuth 后端增加受管理员保护的测试任务 API，再让这个页面发起任务、查看状态和下载日志。
                </p>
              </div>
            </section>
          )}

          {activeTab === 'deploy' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">静态部署</span>
                <h1>前后端分离可以保留协议安全边界</h1>
                <p>
                  NazoAuth Web 可以作为静态 React 应用部署。测试环境由 Angie 托管静态资源，
                  并把协议/API 路径同源反代到 NazoAuth 后端。
                </p>
              </div>
              <div className="docs-card">
                <h2>auth.nazo.run current paths</h2>
                <ul className="docs-list">
                  <li>静态文件目录：<code>/usr/local/angie/html/auth/ui</code></li>
                  <li>Frontend routes: <code>/ui/</code>, <code>/ui/auth</code>, <code>/ui/consent</code>, <code>/ui/profile</code>, <code>/ui/admin</code></li>
                  <li>API 路由：<code>/auth/*</code>、<code>/admin/*</code>、<code>/authorize</code>、<code>/token</code>、<code>/.well-known/*</code></li>
                  <li>Verification command: <code>VITE_BASE_PATH=/ui/ VITE_API_BASE_URL=https://auth.nazo.run npm run build</code></li>
                </ul>
              </div>
            </section>
          )}
        </main>
      </div>
    </motion.div>
  );
}
