import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Book,
  MessageSquare,
  LogIn,
  LogOut,
  Settings2,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { resolveAvatarUrl } from '../lib/avatar';
import './Navbar.css';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [openMenuAtRoute, setOpenMenuAtRoute] = useState('');
  const canAccessAdmin = user?.role === 'admin' && user.admin_level >= 1;
  const currentRouteKey = `${location.pathname}${location.search}${location.hash}`;
  const mobileMenuOpen = openMenuAtRoute === currentRouteKey;

  const links = [
    { path: '/', label: '账户入口', icon: Shield },
    { path: '/docs', label: '接入文档', icon: Book },
    ...(canAccessAdmin
      ? [{ path: '/admin', label: '管理后台', icon: Settings2 }]
      : []),
    { path: '/contact', label: '支持', icon: MessageSquare },
  ];

  const handleLogout = async () => {
    await logout();
    setOpenMenuAtRoute('');
    navigate('/auth', { replace: true });
  };

  return (
    <motion.header
      className="navbar glass"
      initial={false}
      animate={{ opacity: 1 }}
    >
      <div className="navbar-container container">
        <Link to="/" className="navbar-logo" aria-label="返回首页">
          <div className="logo-glow"></div>
          <img src="/icons/site-icon-64x64.png" alt="NazoAuth 图标" className="logo-icon" />
          <span className="logo-text">NazoAuth</span>
        </Link>

        <nav className="navbar-nav navbar-nav-desktop">
          {links.map((link) => {
            const isActive = location.pathname === link.path;
            const Icon = link.icon;

            return (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{link.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="nav-active-pill"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="navbar-actions navbar-actions-desktop">
          {user ? (
            <>
              <Link to="/profile" className="navbar-profile-entry">
                <span className="navbar-avatar-wrap">
                  <img
                    src={resolveAvatarUrl(user.avatar_url)}
                    alt="用户头像"
                    className="navbar-avatar"
                  />
                </span>
                <span className="navbar-profile-text">{user.display_name || '个人中心'}</span>
              </Link>
              <button
                type="button"
                className="btn-secondary navbar-logout"
                onClick={() => {
                  void handleLogout();
                }}
              >
                <LogOut size={16} />
                <span>退出</span>
              </button>
            </>
          ) : (
            <Link to="/auth" className="btn-primary">
              <LogIn size={18} />
              <span>登录</span>
            </Link>
          )}
        </div>

        <button
          type="button"
          className="navbar-mobile-toggle"
          aria-label={mobileMenuOpen ? '关闭导航菜单' : '打开导航菜单'}
          aria-expanded={mobileMenuOpen}
          onClick={() =>
            setOpenMenuAtRoute((value) => (value === currentRouteKey ? '' : currentRouteKey))
          }
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="navbar-mobile-panel glass"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <nav className="navbar-mobile-nav">
              {links.map((link) => {
                const isActive = location.pathname === link.path;
                const Icon = link.icon;
                return (
                  <Link
                    key={`mobile-${link.path}`}
                    to={link.path}
                    className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                    onClick={() => setOpenMenuAtRoute('')}
                  >
                    <span className="mobile-nav-main">
                      <Icon size={17} />
                      <span>{link.label}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="navbar-mobile-actions">
              {user ? (
                <>
                  <Link
                    to="/profile"
                    className="mobile-profile-entry"
                    onClick={() => setOpenMenuAtRoute('')}
                  >
                    <span className="navbar-avatar-wrap">
                      <img
                        src={resolveAvatarUrl(user.avatar_url)}
                        alt="用户头像"
                        className="navbar-avatar"
                      />
                    </span>
                    <span>{user.display_name || '个人中心'}</span>
                  </Link>
                  <button
                    type="button"
                    className="btn-secondary mobile-logout-btn"
                    onClick={() => {
                      void handleLogout();
                    }}
                  >
                    <LogOut size={16} />
                    <span>退出登录</span>
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  className="btn-primary mobile-login-btn"
                  onClick={() => setOpenMenuAtRoute('')}
                >
                  <LogIn size={17} />
                  <span>登录</span>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
