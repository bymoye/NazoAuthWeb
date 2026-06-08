import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ChevronRight, Copy, KeyRound, Network, TerminalSquare } from 'lucide-react';
import './Docs.css';

const sections = [
  { id: 'overview', label: '接入概览', icon: BookOpen },
  { id: 'flow', label: '授权码流程', icon: KeyRound },
  { id: 'metadata', label: '发现端点', icon: Network },
] as const;

type SectionId = (typeof sections)[number]['id'];

const discoveryUrl = 'https://oauth-test.nazo.run/.well-known/openid-configuration';
const authorizeExample =
  'https://oauth-test.nazo.run/authorize?response_type=code&client_id=your_client_id&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&scope=openid%20profile&state=random_state&nonce=random_nonce&code_challenge=base64url_sha256&code_challenge_method=S256';

export default function Docs() {
  const [activeTab, setActiveTab] = useState<SectionId>('overview');
  const [copied, setCopied] = useState('');

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1200);
    } catch {
      setCopied('');
    }
  };

  return (
    <motion.div
      className="page-transition-wrap docs-page container"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2 }}
    >
      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="文档目录">
          <div className="sidebar-sticky">
            <h2 className="sidebar-title">开发者文档</h2>
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
                <span className="docs-eyebrow">NazoAuth integration</span>
                <h1>把外部系统接到 NazoAuth</h1>
                <p>
                  NazoAuth 提供标准 OAuth 2.0 / OpenID Connect 授权入口。
                  外部系统应注册客户端、配置精确 redirect URI，并使用授权码 + PKCE 完成登录。
                </p>
              </div>
              <div className="docs-card">
                <h2>接入前准备</h2>
                <ul className="docs-list">
                  <li>在个人中心提交接入申请，说明站点、回调地址和需要的 scope。</li>
                  <li>管理员审批后会通过一次性链接发放 Client ID 和必要凭据。</li>
                  <li>公共客户端必须使用 PKCE；服务端客户端应妥善保存 client_secret。</li>
                </ul>
              </div>
              <div className="docs-card">
                <h2>推荐 scope</h2>
                <p>
                  登录场景通常只需要 <code>openid profile email</code>。
                  对写接口、后台接口或高风险资源，先在申请中说明用途。
                </p>
              </div>
            </section>
          )}

          {activeTab === 'flow' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">authorization code + PKCE</span>
                <h1>授权码登录流程</h1>
                <p>
                  应用把用户重定向到授权端点。用户在 NazoAuth 登录并确认授权后，
                  授权服务器会带着 code 返回你的 redirect URI。
                </p>
              </div>
              <div className="code-block-wrapper">
                <div className="code-header">
                  <span>Authorization request</span>
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
              <div className="docs-card">
                <h2>令牌交换</h2>
                <p>
                  使用授权码调用 <code>/oidc/token</code>。公共客户端提交
                  <code>code_verifier</code>；机密客户端按注册的认证方式完成客户端认证。
                </p>
              </div>
            </section>
          )}

          {activeTab === 'metadata' && (
            <section className="docs-section">
              <div className="docs-header">
                <span className="docs-eyebrow">OpenID Provider Metadata</span>
                <h1>发现配置与公钥</h1>
                <p>
                  客户端和资源服务器应从发现端点读取 issuer、端点地址、JWKs 和支持能力。
                  不要在应用内硬编码会变化的协议元数据。
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
              <div className="docs-card">
                <h2>常用端点</h2>
                <div className="docs-endpoint-grid">
                  <code>/authorize</code>
                  <code>/token</code>
                  <code>/userinfo</code>
                  <code>/jwks.json</code>
                  <code>/introspect</code>
                  <code>/revoke</code>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </motion.div>
  );
}
