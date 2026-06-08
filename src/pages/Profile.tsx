import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AppWindow,
  FileClock,
  LogOut,
  PlusCircle,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ApiError, apiFetch } from '../lib/api';
import { resolveAvatarUrl } from '../lib/avatar';
import type {
  AuthorizedApp,
  AuthorizedAppsResponse,
  AuthUser,
  ClientAccessRequestItem,
  ClientAccessRequestListResponse,
  ClientCredentialDeliveryResponse,
} from '../types/auth';
import {
  ClientAccessRequestStatus,
  clientAccessRequestStatusMeta,
} from '../types/auth';
import './Profile.css';

type ProfileTab = 'profile' | 'apps' | 'access-requests';

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function normalizeTab(value: string | null): ProfileTab {
  if (value === 'apps' || value === 'access-requests') {
    return value;
  }
  return 'profile';
}

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser, logout } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [apps, setApps] = useState<AuthorizedApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrorMsg, setProfileErrorMsg] = useState('');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');

  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requests, setRequests] = useState<ClientAccessRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestErrorMsg, setRequestErrorMsg] = useState('');
  const [requestSuccessMsg, setRequestSuccessMsg] = useState('');

  const [deliveryResult, setDeliveryResult] =
    useState<ClientCredentialDeliveryResponse | null>(null);
  const [deliveryErrorMsg, setDeliveryErrorMsg] = useState('');
  const consumedDeliveryTokenRef = useRef<string>('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  const deliveryTokenFromUrl = searchParams.get('delivery_token') ?? '';
  const activeTab = useMemo(
    () => normalizeTab(searchParams.get('tab')),
    [searchParams]
  );

  const pendingRequest = useMemo(
    () => requests.find((item) => item.status === ClientAccessRequestStatus.Pending) ?? null,
    [requests]
  );

  useEffect(() => {
    setDisplayName(user?.display_name ?? '');
  }, [user]);

  const updateTab = useCallback(
    (tab: ProfileTab) => {
      if (tab === activeTab) {
        return;
      }
      const nextParams = new URLSearchParams(location.search);
      if (tab === 'profile') {
        nextParams.delete('tab');
      } else {
        nextParams.set('tab', tab);
      }
      const search = nextParams.toString();
      navigate(
        { pathname: '/profile', search: search ? `?${search}` : '' },
        { replace: true }
      );
    },
    [activeTab, location.search, navigate]
  );

  const loadApplications = useCallback(async () => {
    setLoadingApps(true);
    try {
      const response = await apiFetch<AuthorizedAppsResponse>('/auth/me/applications');
      setApps(response.items);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        navigate('/auth', { replace: true });
        return;
      }
      setProfileErrorMsg(resolveErrorMessage(error, '读取授权应用失败'));
    } finally {
      setLoadingApps(false);
    }
  }, [logout, navigate]);

  const loadAccessRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const response = await apiFetch<ClientAccessRequestListResponse>(
        '/auth/me/access-requests'
      );
      setRequests(response.items);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        navigate('/auth', { replace: true });
        return;
      }
      setRequestErrorMsg(resolveErrorMessage(error, '读取接入申请失败'));
    } finally {
      setLoadingRequests(false);
    }
  }, [logout, navigate]);

  useEffect(() => {
    if (activeTab === 'apps') {
      void loadApplications();
      return;
    }
    if (activeTab === 'access-requests') {
      void loadAccessRequests();
    }
  }, [activeTab, loadAccessRequests, loadApplications]);

  useEffect(() => {
    if (!user || !deliveryTokenFromUrl) {
      return;
    }
    if (consumedDeliveryTokenRef.current === deliveryTokenFromUrl) {
      return;
    }
    consumedDeliveryTokenRef.current = deliveryTokenFromUrl;
    setDeliveryErrorMsg('');

    void (async () => {
      try {
        const response = await apiFetch<ClientCredentialDeliveryResponse>(
          `/auth/me/access-delivery?token=${encodeURIComponent(deliveryTokenFromUrl)}`
        );
        setDeliveryResult(response);
      } catch (error) {
        setDeliveryErrorMsg(resolveErrorMessage(error, '一次性凭据读取失败'));
      } finally {
        const nextParams = new URLSearchParams(location.search);
        nextParams.delete('delivery_token');
        if (nextParams.get('tab') !== 'access-requests') {
          nextParams.set('tab', 'access-requests');
        }
        const search = nextParams.toString();
        const nextSearch = search ? `?${search}` : '';
        if (nextSearch !== location.search) {
          navigate(
            { pathname: '/profile', search: nextSearch },
            { replace: true }
          );
        }
      }
    })();
  }, [deliveryTokenFromUrl, location.search, navigate, user]);

  const avatarPreview = useMemo(() => resolveAvatarUrl(user?.avatar_url), [user?.avatar_url]);

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      return;
    }
    setProfileErrorMsg('');
    setProfileSuccessMsg('');

    const normalizedDisplayName = displayName.trim();
    const payload: Record<string, string | null> = {};

    if (normalizedDisplayName !== (user.display_name ?? '')) {
      payload.display_name = normalizedDisplayName || null;
    }
    if (Object.keys(payload).length === 0 && !avatarFile) {
      setProfileSuccessMsg('资料未变更。');
      return;
    }

    setSavingProfile(true);
    try {
      let latestUser = user;
      if (Object.keys(payload).length > 0) {
        latestUser = await apiFetch<AuthUser>('/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        latestUser = await apiFetch<AuthUser>('/auth/me/avatar', {
          method: 'POST',
          body: formData,
        });
        setAvatarFile(null);
        if (avatarInputRef.current) {
          avatarInputRef.current.value = '';
        }
      }
      setUser(latestUser);
      setProfileSuccessMsg('资料已更新。');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        navigate('/auth', { replace: true });
        return;
      }
      setProfileErrorMsg(resolveErrorMessage(error, '更新资料失败'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) {
      return;
    }
    setProfileErrorMsg('');
    setProfileSuccessMsg('');
    setSavingProfile(true);
    try {
      const updatedUser = await apiFetch<AuthUser>('/auth/me/avatar', {
        method: 'DELETE',
      });
      setUser(updatedUser);
      setAvatarFile(null);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
      setProfileSuccessMsg('头像已恢复默认。');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        navigate('/auth', { replace: true });
        return;
      }
      setProfileErrorMsg(resolveErrorMessage(error, '删除头像失败'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSubmitAccessRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      return;
    }
    setRequestErrorMsg('');
    setRequestSuccessMsg('');

    const normalizedName = siteName.trim();
    const normalizedUrl = siteUrl.trim();
    const normalizedDescription = requestDescription.trim();

    if (!normalizedName || !normalizedUrl || !normalizedDescription) {
      setRequestErrorMsg('请完整填写站点名、URL 和申请描述。');
      return;
    }
    if (pendingRequest) {
      setRequestErrorMsg('已有待处理申请，请等待审批完成后再提交。');
      return;
    }

    setSubmittingRequest(true);
    try {
      await apiFetch<ClientAccessRequestItem>('/auth/me/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_name: normalizedName,
          site_url: normalizedUrl,
          request_description: normalizedDescription,
        }),
      });
      setRequestSuccessMsg('申请已提交，等待管理员审批。');
      setSiteName('');
      setSiteUrl('');
      setRequestDescription('');
      await loadAccessRequests();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        navigate('/auth', { replace: true });
        return;
      }
      setRequestErrorMsg(resolveErrorMessage(error, '提交申请失败'));
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/auth', { replace: true });
  };

  if (!user) {
    return null;
  }

  return (
    <motion.div
      className="page-transition-wrap profile-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="container profile-container">
        <section className="profile-overview glass">
          <img src={avatarPreview} alt="用户头像" className="profile-avatar" />
          <div className="profile-overview-main">
            <h1>{user.display_name || '未设置昵称'}</h1>
            <p>{user.email}</p>
          </div>
          <div className="profile-stats">
            <span>已授权应用</span>
            <strong>{user.authorized_app_count}</strong>
          </div>
        </section>

        <nav className="profile-tabs">
          <button
            type="button"
            className={activeTab === 'profile' ? 'active' : ''}
            onClick={() => updateTab('profile')}
          >
            <UserRound size={16} />
            <span>个人资料</span>
          </button>
          <button
            type="button"
            className={activeTab === 'apps' ? 'active' : ''}
            onClick={() => updateTab('apps')}
          >
            <AppWindow size={16} />
            <span>授权应用</span>
          </button>
          <button
            type="button"
            className={activeTab === 'access-requests' ? 'active' : ''}
            onClick={() => updateTab('access-requests')}
          >
            <FileClock size={16} />
            <span>接入申请</span>
          </button>
        </nav>

        <AnimatePresence mode="wait">
          {activeTab === 'profile' && (
            <motion.section
              key="tab-profile"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="profile-card glass"
            >
            <h2>
              <UserRound size={18} />
              <span>个人资料</span>
            </h2>
            <form onSubmit={handleSaveProfile} className="profile-form">
              <label htmlFor="display_name">昵称</label>
              <input
                id="display_name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
                placeholder="输入你的显示昵称"
              />

              <label htmlFor="avatar_file">上传头像</label>
              <input
                ref={avatarInputRef}
                id="avatar_file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setAvatarFile(file);
                }}
              />
              <p className="profile-form-hint">
                仅支持 PNG / JPEG / WEBP，最大 2MB。
                {avatarFile ? ` 已选择：${avatarFile.name}` : ''}
              </p>

              {profileErrorMsg && <div className="profile-alert error">{profileErrorMsg}</div>}
              {profileSuccessMsg && (
                <div className="profile-alert success">{profileSuccessMsg}</div>
              )}

              <div className="profile-form-actions">
                <button type="submit" className="btn-primary" disabled={savingProfile}>
                  {avatarFile ? <Upload size={16} /> : <Save size={16} />}
                  <span>{savingProfile ? '保存中...' : avatarFile ? '保存并上传头像' : '保存资料'}</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingProfile || !user.avatar_url}
                  onClick={() => {
                    void handleRemoveAvatar();
                  }}
                >
                  <Trash2 size={16} />
                  <span>恢复默认头像</span>
                </button>
                <button type="button" className="btn-secondary" onClick={handleLogout}>
                  <LogOut size={16} />
                  <span>退出登录</span>
                </button>
              </div>
            </form>
            </motion.section>
          )}

          {activeTab === 'apps' && (
            <motion.section
              key="tab-apps"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="profile-card glass"
            >
            <h2>
              <AppWindow size={18} />
              <span>授权应用</span>
            </h2>

            {loadingApps ? (
              <div className="profile-placeholder">正在加载授权应用...</div>
            ) : apps.length === 0 ? (
              <div className="profile-placeholder">暂无历史授权记录。</div>
            ) : (
              <ul className="authorized-list">
                {apps.map((item) => (
                  <li key={item.client_id}>
                    <div className="authorized-item-top">
                      <strong>{item.client_name}</strong>
                      <span>{item.authorization_count} 次</span>
                    </div>
                    <p>Client ID: {item.client_id}</p>
                    <p>最近授权: {formatDateTime(item.last_authorized_at)}</p>
                    <p>Scope: {item.last_scopes.join(' ') || '无'}</p>
                  </li>
                ))}
              </ul>
            )}
            </motion.section>
          )}

          {activeTab === 'access-requests' && (
            <motion.section
              key="tab-requests"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="profile-grid"
            >
            <article className="profile-card glass">
              <h2>
                <PlusCircle size={18} />
                <span>申请接入应用</span>
              </h2>

              {pendingRequest && (
                <div className="profile-alert warning">
                  你当前有 1 条待处理申请，请等待管理员处理后再提交。
                </div>
              )}
              {requestErrorMsg && <div className="profile-alert error">{requestErrorMsg}</div>}
              {requestSuccessMsg && (
                <div className="profile-alert success">{requestSuccessMsg}</div>
              )}

              <form className="profile-form" onSubmit={handleSubmitAccessRequest}>
                <label htmlFor="request_site_name">站点名</label>
                <input
                  id="request_site_name"
                  type="text"
                  value={siteName}
                  onChange={(event) => setSiteName(event.target.value)}
                  maxLength={120}
                  placeholder="例如：Nazo Docs"
                  disabled={Boolean(pendingRequest)}
                />

                <label htmlFor="request_site_url">站点 URL</label>
                <input
                  id="request_site_url"
                  type="url"
                  value={siteUrl}
                  onChange={(event) => setSiteUrl(event.target.value)}
                  placeholder="https://example.com/callback"
                  disabled={Boolean(pendingRequest)}
                />

                <label htmlFor="request_description">申请描述</label>
                <textarea
                  id="request_description"
                  value={requestDescription}
                  onChange={(event) => setRequestDescription(event.target.value)}
                  placeholder="说明用途、回调场景、预期 scope。"
                  maxLength={2000}
                  rows={5}
                  disabled={Boolean(pendingRequest)}
                />

                <div className="profile-form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submittingRequest || Boolean(pendingRequest)}
                  >
                    <PlusCircle size={16} />
                    <span>{submittingRequest ? '提交中...' : '提交申请'}</span>
                  </button>
                </div>
              </form>
            </article>

            <article className="profile-card glass">
              <h2>
                <FileClock size={18} />
                <span>申请记录</span>
              </h2>

              {deliveryErrorMsg && <div className="profile-alert error">{deliveryErrorMsg}</div>}
              {deliveryResult && (
                <div className="delivery-card">
                  <div className="delivery-card-head">
                    <ShieldAlert size={16} />
                    <strong>一次性凭据（已阅后即焚）</strong>
                  </div>
                  <p>{deliveryResult.read_once_notice}</p>
                  <p>Client ID: {deliveryResult.client_id}</p>
                  <p>Client Name: {deliveryResult.client_name}</p>
                  <p>Client Type: {deliveryResult.client_type}</p>
                  <p>Auth Method: {deliveryResult.token_endpoint_auth_method}</p>
                  <p>Redirect URIs: {deliveryResult.redirect_uris.join(', ') || '-'}</p>
                  <p>Scopes: {deliveryResult.scopes.join(' ') || '-'}</p>
                  <p>Grant Types: {deliveryResult.grant_types.join(' ') || '-'}</p>
                  <p>
                    Client Secret:{' '}
                    {deliveryResult.client_secret ? deliveryResult.client_secret : '（public 客户端无密钥）'}
                  </p>
                  <p>链接失效时间: {formatDateTime(deliveryResult.expires_at)}</p>
                </div>
              )}

              {loadingRequests ? (
                <div className="profile-placeholder">正在加载申请记录...</div>
              ) : requests.length === 0 ? (
                <div className="profile-placeholder">暂无申请记录。</div>
              ) : (
                <ul className="request-list">
                  {requests.map((item) => (
                    <li key={item.id}>
                      <div className="request-item-top">
                        <strong>{item.site_name}</strong>
                        <span
                          className={`request-status ${clientAccessRequestStatusMeta[item.status].className}`}
                        >
                          {clientAccessRequestStatusMeta[item.status].label}
                        </span>
                      </div>
                      <p>URL: {item.site_url}</p>
                      <p>描述: {item.request_description}</p>
                      <p>提交时间: {formatDateTime(item.created_at)}</p>
                      {item.resolved_at && <p>处理时间: {formatDateTime(item.resolved_at)}</p>}
                      {item.admin_note && <p>审批说明: {item.admin_note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </article>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
