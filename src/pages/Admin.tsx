import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  AppWindow,
  Ban,
  CheckCircle2,
  FileClock,
  Link2,
  PencilLine,
  Plus,
  Search,
  ShieldCheck,
  UserRoundCog,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { buildAuthRedirectWithNext } from '../auth/next';
import { useAuth } from '../auth/useAuth';
import { API_BASE_URL, ApiError, apiFetch } from '../lib/api';
import type {
  AdminAccessRequestItem,
  AdminAccessRequestListResponse,
  AdminClientItem,
  AdminClientListResponse,
  AdminGrantItem,
  AdminGrantListResponse,
  AdminGrantRevokeResponse,
  AdminUserItem,
  AdminUserListResponse,
} from '../types/auth';
import {
  ClientAccessRequestStatus,
  clientAccessRequestStatusMeta,
} from '../types/auth';
import './Admin.css';

type AdminTab = 'users' | 'clients' | 'grants' | 'access-requests';
type ClientTypeValue = 'public' | 'confidential';
type AuthMethodValue = 'none' | 'client_secret_basic' | 'client_secret_post';

type UserPatchPayload = {
  role?: 'user' | 'admin';
  admin_level?: number;
  is_active?: boolean;
};

type ClientFormModel = {
  clientName: string;
  clientType: ClientTypeValue;
  tokenEndpointAuthMethod: AuthMethodValue;
  redirectUris: string[];
  scopes: string[];
  allowedAudiences: string[];
  grantTypes: string[];
  isActive: boolean;
};

type PreparedClientForm =
  | {
      ok: true;
      clientName: string;
      redirectUris: string[];
      scopes: string[];
      allowedAudiences: string[];
      grantTypes: string[];
    }
  | { ok: false; message: string };

const DEFAULT_SCOPE_OPTIONS = ['openid', 'profile', 'email'] as const;
const GRANT_TYPE_OPTIONS = [
  { value: 'authorization_code', label: 'authorization_code', description: '标准授权码流程（推荐）' },
  { value: 'refresh_token', label: 'refresh_token', description: '允许换取新的 access token' },
  { value: 'client_credentials', label: 'client_credentials', description: '仅服务端到服务端场景' },
] as const;

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function buildPaginationQuery(params: {
  page: number;
  pageSize: number;
  q?: string;
  role?: string;
  isActive?: string;
}): string {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('page_size', String(params.pageSize));
  if (params.q && params.q.trim()) {
    query.set('q', params.q.trim());
  }
  if (params.role && params.role.trim()) {
    query.set('role', params.role.trim());
  }
  if (params.isActive && params.isActive.trim()) {
    query.set('is_active', params.isActive.trim());
  }
  return query.toString();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol);
  } catch {
    return false;
  }
}

function toggleSelection(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }
  return [...values, value];
}

function enforceClientFormRules(form: ClientFormModel): ClientFormModel {
  const next: ClientFormModel = {
    ...form,
    scopes: uniqueStrings(form.scopes),
    allowedAudiences: uniqueStrings(form.allowedAudiences),
    grantTypes: uniqueStrings(form.grantTypes),
  };
  if (next.clientType === 'public') {
    next.tokenEndpointAuthMethod = 'none';
    next.grantTypes = next.grantTypes.filter((grantType) => grantType !== 'client_credentials');
  } else if (next.tokenEndpointAuthMethod === 'none') {
    next.tokenEndpointAuthMethod = 'client_secret_basic';
  }
  return next;
}

function prepareClientForm(form: ClientFormModel): PreparedClientForm {
  const clientName = form.clientName.trim();
  if (!clientName) {
    return { ok: false, message: '请填写应用名称。' };
  }

  const redirectUris = uniqueStrings(form.redirectUris);
  if (form.grantTypes.includes('authorization_code') && redirectUris.length === 0) {
    return { ok: false, message: 'authorization_code 模式必须至少提供一个回调地址。' };
  }
  if (redirectUris.some((uri) => !isValidAbsoluteUrl(uri))) {
    return { ok: false, message: '存在不合法的回调地址，请使用完整 URL。' };
  }

  const scopes = uniqueStrings(form.scopes);
  if (scopes.length === 0) {
    return { ok: false, message: '请至少选择一个 scope。' };
  }
  const allowedAudiences = uniqueStrings(form.allowedAudiences);
  if (allowedAudiences.length === 0) {
    return { ok: false, message: '请至少配置一个 allowed audience。' };
  }

  const grantTypes = uniqueStrings(form.grantTypes);
  if (grantTypes.length === 0) {
    return { ok: false, message: '请至少选择一个 grant type。' };
  }
  if (grantTypes.includes('client_credentials') && scopes.includes('openid')) {
    return {
      ok: false,
      message: 'client_credentials 客户端不允许包含 openid scope。',
    };
  }

  if (form.clientType === 'public') {
    if (grantTypes.includes('client_credentials')) {
      return { ok: false, message: 'public 客户端不支持 client_credentials。' };
    }
    if (form.tokenEndpointAuthMethod !== 'none') {
      return { ok: false, message: 'public 客户端必须使用 token_endpoint_auth_method=none。' };
    }
  } else if (form.tokenEndpointAuthMethod === 'none') {
    return { ok: false, message: 'confidential 客户端必须使用 client_secret_basic 或 client_secret_post。' };
  }

  return {
    ok: true,
    clientName,
    redirectUris,
    scopes,
    allowedAudiences,
    grantTypes,
  };
}

function createInitialClientForm(): ClientFormModel {
  return {
    clientName: 'demo-web-client',
    clientType: 'public',
    tokenEndpointAuthMethod: 'none',
    redirectUris: ['https://accounts-test.nazo.run/docs'],
    scopes: ['openid', 'profile'],
    allowedAudiences: ['resource://default'],
    grantTypes: ['authorization_code', 'refresh_token'],
    isActive: true,
  };
}

function toClientForm(item: AdminClientItem): ClientFormModel {
  return enforceClientFormRules({
    clientName: item.client_name,
    clientType: item.client_type,
    tokenEndpointAuthMethod: item.token_endpoint_auth_method as AuthMethodValue,
    redirectUris: item.redirect_uris.length ? [...item.redirect_uris] : [''],
    scopes: [...item.scopes],
    allowedAudiences: item.allowed_audiences?.length
      ? [...item.allowed_audiences]
      : ['resource://default'],
    grantTypes: [...item.grant_types],
    isActive: item.is_active,
  });
}

function createApprovalClientFormFromRequest(
  request: AdminAccessRequestItem
): ClientFormModel {
  return enforceClientFormRules({
    clientName: request.site_name,
    clientType: 'confidential',
    tokenEndpointAuthMethod: 'client_secret_basic',
    redirectUris: [request.site_url],
    scopes: ['openid', 'profile'],
    allowedAudiences: ['resource://default'],
    grantTypes: ['authorization_code', 'refresh_token'],
    isActive: true,
  });
}

export default function Admin() {
  const { user, loading, sessionChecked } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const initializedRef = useRef(false);
  const tabLoadedRef = useRef<Record<AdminTab, boolean>>({
    users: false,
    clients: false,
    grants: false,
    'access-requests': false,
  });
  const usersRequestIdRef = useRef(0);
  const clientsRequestIdRef = useRef(0);
  const grantsRequestIdRef = useRef(0);
  const accessRequestsRequestIdRef = useRef(0);

  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const usersPageSize = 20;
  const [usersQuery, setUsersQuery] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState('');
  const [usersActiveFilter, setUsersActiveFilter] = useState('');
  const [userUpdatingId, setUserUpdatingId] = useState('');

  const [clients, setClients] = useState<AdminClientItem[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsPage, setClientsPage] = useState(1);
  const clientsPageSize = 20;
  const [clientsQuery, setClientsQuery] = useState('');
  const [clientsActiveFilter, setClientsActiveFilter] = useState('');
  const [clientUpdatingId, setClientUpdatingId] = useState('');

  const [scopeOptions, setScopeOptions] = useState<string[]>([
    ...DEFAULT_SCOPE_OPTIONS,
  ]);
  const [scopesLoading, setScopesLoading] = useState(false);
  const [scopesLoaded, setScopesLoaded] = useState(false);

  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [createClientForm, setCreateClientForm] = useState<ClientFormModel>(
    createInitialClientForm()
  );
  const [creatingClient, setCreatingClient] = useState(false);
  const [createdClientSecret, setCreatedClientSecret] = useState('');

  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editClientId, setEditClientId] = useState('');
  const [editClientForm, setEditClientForm] = useState<ClientFormModel | null>(null);
  const [savingClientEdit, setSavingClientEdit] = useState(false);

  const [grants, setGrants] = useState<AdminGrantItem[]>([]);
  const [grantsTotal, setGrantsTotal] = useState(0);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsPage, setGrantsPage] = useState(1);
  const grantsPageSize = 20;
  const [grantsQuery, setGrantsQuery] = useState('');
  const [revokingGrantKey, setRevokingGrantKey] = useState('');

  const [accessRequests, setAccessRequests] = useState<AdminAccessRequestItem[]>([]);
  const [accessRequestsTotal, setAccessRequestsTotal] = useState(0);
  const [accessRequestsLoading, setAccessRequestsLoading] = useState(false);
  const [accessRequestsPage, setAccessRequestsPage] = useState(1);
  const accessRequestsPageSize = 20;
  const [accessRequestsQuery, setAccessRequestsQuery] = useState('');
  const [accessRequestsStatusFilter, setAccessRequestsStatusFilter] = useState('');

  const [showApproveRequestModal, setShowApproveRequestModal] = useState(false);
  const [selectedAccessRequest, setSelectedAccessRequest] =
    useState<AdminAccessRequestItem | null>(null);
  const [approveRequestForm, setApproveRequestForm] =
    useState<ClientFormModel | null>(null);
  const [approveRequestAdminNote, setApproveRequestAdminNote] = useState('');
  const [approvingRequest, setApprovingRequest] = useState(false);

  const [showRejectRequestModal, setShowRejectRequestModal] = useState(false);
  const [rejectRequestAdminNote, setRejectRequestAdminNote] = useState('');
  const [rejectingRequest, setRejectingRequest] = useState(false);

  const canAccessAdmin = user?.role === 'admin' && user.admin_level >= 1;

  const clearFeedback = () => {
    setFeedbackError('');
    setFeedbackSuccess('');
  };

  const setCreateFormWithRules = (
    updater: (prev: ClientFormModel) => ClientFormModel
  ) => {
    setCreateClientForm((prev) => enforceClientFormRules(updater(prev)));
  };

  const setEditFormWithRules = (
    updater: (prev: ClientFormModel) => ClientFormModel
  ) => {
    setEditClientForm((prev) => {
      if (!prev) {
        return prev;
      }
      return enforceClientFormRules(updater(prev));
    });
  };

  const setApproveFormWithRules = (
    updater: (prev: ClientFormModel) => ClientFormModel
  ) => {
    setApproveRequestForm((prev) => {
      if (!prev) {
        return prev;
      }
      return enforceClientFormRules(updater(prev));
    });
  };

  const ensureScopeOptionsLoaded = useCallback(async () => {
    if (!canAccessAdmin || scopesLoading || scopesLoaded) {
      return;
    }

    setScopesLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/.well-known/openid-configuration`, {
        method: 'GET',
        credentials: 'omit',
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        scopes_supported?: string[];
      };
      const discoveredScopes = uniqueStrings(payload.scopes_supported ?? []);
      if (discoveredScopes.length > 0) {
        setScopeOptions(uniqueStrings([...DEFAULT_SCOPE_OPTIONS, ...discoveredScopes]));
      }
      setScopesLoaded(true);
    } catch {
      // Keep default scope options if discovery fails.
    } finally {
      setScopesLoading(false);
    }
  }, [canAccessAdmin, scopesLoaded, scopesLoading]);

  const loadUsers = useCallback(
    async (page = 1) => {
      const requestId = ++usersRequestIdRef.current;
      setUsersLoading(true);
      try {
        const query = buildPaginationQuery({
          page,
          pageSize: usersPageSize,
          q: usersQuery,
          role: usersRoleFilter,
          isActive: usersActiveFilter,
        });
        const result = await apiFetch<AdminUserListResponse>(`/admin/users?${query}`);
        if (requestId !== usersRequestIdRef.current) {
          return;
        }
        tabLoadedRef.current.users = true;
        setUsers(result.items);
        setUsersTotal(result.total);
        setUsersPage(result.page);
      } catch (error) {
        if (requestId !== usersRequestIdRef.current) {
          return;
        }
        setFeedbackError(resolveErrorMessage(error, '加载用户列表失败。'));
      } finally {
        if (requestId === usersRequestIdRef.current) {
          setUsersLoading(false);
        }
      }
    },
    [usersActiveFilter, usersPageSize, usersQuery, usersRoleFilter]
  );

  const loadClients = useCallback(
    async (page = 1) => {
      const requestId = ++clientsRequestIdRef.current;
      setClientsLoading(true);
      try {
        const query = buildPaginationQuery({
          page,
          pageSize: clientsPageSize,
          q: clientsQuery,
          isActive: clientsActiveFilter,
        });
        const result = await apiFetch<AdminClientListResponse>(`/admin/clients?${query}`);
        if (requestId !== clientsRequestIdRef.current) {
          return;
        }
        tabLoadedRef.current.clients = true;
        setClients(result.items);
        setClientsTotal(result.total);
        setClientsPage(result.page);
      } catch (error) {
        if (requestId !== clientsRequestIdRef.current) {
          return;
        }
        setFeedbackError(resolveErrorMessage(error, '加载应用列表失败。'));
      } finally {
        if (requestId === clientsRequestIdRef.current) {
          setClientsLoading(false);
        }
      }
    },
    [clientsActiveFilter, clientsPageSize, clientsQuery]
  );

  const loadGrants = useCallback(
    async (page = 1) => {
      const requestId = ++grantsRequestIdRef.current;
      setGrantsLoading(true);
      try {
        const query = buildPaginationQuery({
          page,
          pageSize: grantsPageSize,
          q: grantsQuery,
        });
        const result = await apiFetch<AdminGrantListResponse>(`/admin/grants?${query}`);
        if (requestId !== grantsRequestIdRef.current) {
          return;
        }
        tabLoadedRef.current.grants = true;
        setGrants(result.items);
        setGrantsTotal(result.total);
        setGrantsPage(result.page);
      } catch (error) {
        if (requestId !== grantsRequestIdRef.current) {
          return;
        }
        setFeedbackError(resolveErrorMessage(error, '加载授权记录失败。'));
      } finally {
        if (requestId === grantsRequestIdRef.current) {
          setGrantsLoading(false);
        }
      }
    },
    [grantsPageSize, grantsQuery]
  );

  const loadAccessRequests = useCallback(
    async (page = 1) => {
      const requestId = ++accessRequestsRequestIdRef.current;
      setAccessRequestsLoading(true);
      try {
        const query = buildPaginationQuery({
          page,
          pageSize: accessRequestsPageSize,
          q: accessRequestsQuery,
        });
        const requestQuery = new URLSearchParams(query);
        if (accessRequestsStatusFilter) {
          requestQuery.set('status', accessRequestsStatusFilter);
        }
        const result = await apiFetch<AdminAccessRequestListResponse>(
          `/admin/access-requests?${requestQuery.toString()}`
        );
        if (requestId !== accessRequestsRequestIdRef.current) {
          return;
        }
        tabLoadedRef.current['access-requests'] = true;
        setAccessRequests(result.items);
        setAccessRequestsTotal(result.total);
        setAccessRequestsPage(result.page);
      } catch (error) {
        if (requestId !== accessRequestsRequestIdRef.current) {
          return;
        }
        setFeedbackError(resolveErrorMessage(error, '加载接入申请失败。'));
      } finally {
        if (requestId === accessRequestsRequestIdRef.current) {
          setAccessRequestsLoading(false);
        }
      }
    },
    [
      accessRequestsPageSize,
      accessRequestsQuery,
      accessRequestsStatusFilter,
    ]
  );

  const loadTabIfNeeded = useCallback(
    (tab: AdminTab) => {
      if (tabLoadedRef.current[tab]) {
        return;
      }
      if (tab === 'users') {
        void loadUsers(1);
        return;
      }
      if (tab === 'clients') {
        void loadClients(1);
        return;
      }
      if (tab === 'grants') {
        void loadGrants(1);
        return;
      }
      void loadAccessRequests(1);
    },
    [loadAccessRequests, loadClients, loadGrants, loadUsers]
  );

  useEffect(() => {
    if (!canAccessAdmin || initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    loadTabIfNeeded('users');
  }, [canAccessAdmin, loadTabIfNeeded]);

  useEffect(() => {
    if (
      !showCreateClientModal &&
      !showEditClientModal &&
      !showApproveRequestModal &&
      !showRejectRequestModal
    ) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (!creatingClient) {
        setShowCreateClientModal(false);
      }
      if (!savingClientEdit) {
        setShowEditClientModal(false);
      }
      if (!approvingRequest) {
        setShowApproveRequestModal(false);
      }
      if (!rejectingRequest) {
        setShowRejectRequestModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    approvingRequest,
    creatingClient,
    rejectingRequest,
    savingClientEdit,
    showApproveRequestModal,
    showCreateClientModal,
    showEditClientModal,
    showRejectRequestModal,
  ]);

  const usersTotalPages = useMemo(
    () => Math.max(1, Math.ceil(usersTotal / usersPageSize)),
    [usersPageSize, usersTotal]
  );
  const clientsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(clientsTotal / clientsPageSize)),
    [clientsPageSize, clientsTotal]
  );
  const grantsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(grantsTotal / grantsPageSize)),
    [grantsPageSize, grantsTotal]
  );
  const accessRequestsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(accessRequestsTotal / accessRequestsPageSize)),
    [accessRequestsPageSize, accessRequestsTotal]
  );
  const handleTabChange = (tab: AdminTab) => {
    if (activeTab === tab) {
      return;
    }
    clearFeedback();
    setActiveTab(tab);
    loadTabIfNeeded(tab);
  };

  const availableScopeOptions = useMemo(
    () =>
      uniqueStrings([
        ...scopeOptions,
        ...createClientForm.scopes,
        ...(editClientForm?.scopes ?? []),
        ...(approveRequestForm?.scopes ?? []),
      ]),
    [
      approveRequestForm?.scopes,
      createClientForm.scopes,
      editClientForm?.scopes,
      scopeOptions,
    ]
  );

  const updateUser = async (userId: string, payload: UserPatchPayload, successMsg: string) => {
    setUserUpdatingId(userId);
    clearFeedback();
    try {
      const updatedUser = await apiFetch<AdminUserItem>(`/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setFeedbackSuccess(successMsg);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
    } catch (error) {
      setFeedbackError(resolveErrorMessage(error, '更新用户失败。'));
    } finally {
      setUserUpdatingId('');
    }
  };

  const updateClient = async (
    clientId: string,
    payload: Record<string, unknown>,
    successMsg: string
  ) => {
    setClientUpdatingId(clientId);
    clearFeedback();
    try {
      const updatedClient = await apiFetch<AdminClientItem>(`/admin/clients/${encodeURIComponent(clientId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setFeedbackSuccess(successMsg);
      setClients((prev) => prev.map((c) => (c.client_id === clientId ? updatedClient : c)));
    } catch (error) {
      setFeedbackError(resolveErrorMessage(error, '更新应用失败。'));
    } finally {
      setClientUpdatingId('');
    }
  };

  const openCreateClientModal = () => {
    clearFeedback();
    void ensureScopeOptionsLoaded();
    setCreatedClientSecret('');
    setCreateClientForm(createInitialClientForm());
    setShowCreateClientModal(true);
  };

  const openEditClientModal = (item: AdminClientItem) => {
    clearFeedback();
    void ensureScopeOptionsLoaded();
    setEditClientId(item.client_id);
    setEditClientForm(toClientForm(item));
    setShowEditClientModal(true);
  };

  const openApproveRequestModal = (item: AdminAccessRequestItem) => {
    clearFeedback();
    void ensureScopeOptionsLoaded();
    setSelectedAccessRequest(item);
    setApproveRequestAdminNote('');
    setApproveRequestForm(createApprovalClientFormFromRequest(item));
    setShowApproveRequestModal(true);
  };

  const openRejectRequestModal = (item: AdminAccessRequestItem) => {
    clearFeedback();
    setSelectedAccessRequest(item);
    setRejectRequestAdminNote('');
    setShowRejectRequestModal(true);
  };

  const handleCreateClient = async (event: FormEvent) => {
    event.preventDefault();
    clearFeedback();
    setCreatedClientSecret('');

    const normalizedForm = enforceClientFormRules(createClientForm);
    const prepared = prepareClientForm(normalizedForm);
    if (!prepared.ok) {
      setFeedbackError(prepared.message);
      return;
    }

    setCreatingClient(true);
    try {
      const result = await apiFetch<AdminClientItem>('/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: prepared.clientName,
          client_type: normalizedForm.clientType,
          redirect_uris: prepared.redirectUris,
          scopes: prepared.scopes,
          allowed_audiences: prepared.allowedAudiences,
          grant_types: prepared.grantTypes,
          token_endpoint_auth_method: normalizedForm.tokenEndpointAuthMethod,
        }),
      });
      setFeedbackSuccess(`客户端创建成功：${result.client_id}`);
      if (result.client_secret) {
        setCreatedClientSecret(result.client_secret);
      }
      await loadClients(1);
    } catch (error) {
      setFeedbackError(resolveErrorMessage(error, '创建客户端失败。'));
    } finally {
      setCreatingClient(false);
    }
  };

  const handleSaveClientEdit = async (event: FormEvent) => {
    event.preventDefault();
    clearFeedback();

    if (!editClientId || !editClientForm) {
      setFeedbackError('未找到要编辑的客户端。');
      return;
    }

    const normalizedForm = enforceClientFormRules(editClientForm);
    const prepared = prepareClientForm(normalizedForm);
    if (!prepared.ok) {
      setFeedbackError(prepared.message);
      return;
    }

    setSavingClientEdit(true);
    try {
      const updatedClient = await apiFetch<AdminClientItem>(`/admin/clients/${encodeURIComponent(editClientId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: prepared.clientName,
          redirect_uris: prepared.redirectUris,
          scopes: prepared.scopes,
          allowed_audiences: prepared.allowedAudiences,
          grant_types: prepared.grantTypes,
          is_active: normalizedForm.isActive,
        }),
      });
      setFeedbackSuccess('客户端已更新。');
      setClients((prev) => prev.map((c) => (c.client_id === editClientId ? updatedClient : c)));
      setShowEditClientModal(false);
    } catch (error) {
      setFeedbackError(resolveErrorMessage(error, '更新客户端失败。'));
    } finally {
      setSavingClientEdit(false);
    }
  };

  const handleApproveAccessRequest = async (event: FormEvent) => {
    event.preventDefault();
    clearFeedback();
    if (!selectedAccessRequest || !approveRequestForm) {
      setFeedbackError('未找到要审批的申请。');
      return;
    }

    const normalizedForm = enforceClientFormRules(approveRequestForm);
    const prepared = prepareClientForm(normalizedForm);
    if (!prepared.ok) {
      setFeedbackError(prepared.message);
      return;
    }

    setApprovingRequest(true);
    try {
      const updatedRequest = await apiFetch<AdminAccessRequestItem>(
        `/admin/access-requests/${encodeURIComponent(selectedAccessRequest.id)}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: prepared.clientName,
            client_type: normalizedForm.clientType,
            redirect_uris: prepared.redirectUris,
            scopes: prepared.scopes,
            allowed_audiences: prepared.allowedAudiences,
            grant_types: prepared.grantTypes,
            token_endpoint_auth_method: normalizedForm.tokenEndpointAuthMethod,
            admin_note: approveRequestAdminNote.trim() || null,
          }),
        }
      );
      setFeedbackSuccess(
        '申请已通过，客户端信息已通过一次性阅后即焚链接发送至申请人邮箱。'
      );
      setShowApproveRequestModal(false);
      
      // Update the request item in-place
      setAccessRequests((prev) => prev.map((r) => (r.id === selectedAccessRequest.id ? updatedRequest : r)));
      // Still need to load new clients to show the newly generated app
      await loadClients(1);
    } catch (error) {
      setFeedbackError(resolveErrorMessage(error, '审批申请失败。'));
    } finally {
      setApprovingRequest(false);
    }
  };

  const handleRejectAccessRequest = async (event: FormEvent) => {
    event.preventDefault();
    clearFeedback();
    if (!selectedAccessRequest) {
      setFeedbackError('未找到要拒绝的申请。');
      return;
    }
    const note = rejectRequestAdminNote.trim();
    if (!note) {
      setFeedbackError('请填写拒绝原因。');
      return;
    }

    setRejectingRequest(true);
    try {
      const updatedRequest = await apiFetch<AdminAccessRequestItem>(
        `/admin/access-requests/${encodeURIComponent(selectedAccessRequest.id)}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_note: note }),
        }
      );
      setFeedbackSuccess('申请已拒绝，拒绝原因已发送至申请人邮箱。');
      setShowRejectRequestModal(false);
      setAccessRequests((prev) => prev.map((r) => (r.id === selectedAccessRequest.id ? updatedRequest : r)));
    } catch (error) {
      setFeedbackError(resolveErrorMessage(error, '拒绝申请失败。'));
    } finally {
      setRejectingRequest(false);
    }
  };

  const handleRevokeGrant = async (item: AdminGrantItem) => {
    const key = `${item.user_id}:${item.client_id}`;
    setRevokingGrantKey(key);
    clearFeedback();
    try {
      const result = await apiFetch<AdminGrantRevokeResponse>('/admin/grants/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: item.user_id,
          client_id: item.client_id,
        }),
      });
      setFeedbackSuccess(
        `撤销完成：${result.revoked_refresh_tokens} 个 refresh token，${result.removed_grants} 条授权记录。`
      );
      await loadGrants(grantsPage);
    } catch (error) {
      setFeedbackError(resolveErrorMessage(error, '撤销授权失败。'));
    } finally {
      setRevokingGrantKey('');
    }
  };

  if (loading || (!user && !sessionChecked)) {
    return <div className="container admin-loading">正在验证管理员登录状态...</div>;
  }

  if (!user) {
    return <Navigate to={buildAuthRedirectWithNext('/admin')} replace />;
  }

  if (!canAccessAdmin) {
    return (
      <div className="container admin-access-denied">
        <div className="glass admin-access-denied-card">
          <AlertTriangle size={20} />
          <h1>无管理权限</h1>
          <p>当前账号不是管理员，或管理员等级不足。</p>
          <Link to="/" className="btn-secondary">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="page-transition-wrap admin-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="admin-bg-grid" aria-hidden="true" />

      <div className="container admin-container">
        <header className="admin-header glass">
          <div>
            <h1>NazoAuth 管理后台</h1>
            <p>
              登录身份：{user.display_name || user.email}（{user.role} / level {user.admin_level}
              ）
            </p>
          </div>
        </header>

        <div className="admin-toast-container">
          <AnimatePresence>
            {feedbackError && (
              <motion.div
                key="toast-error"
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="admin-toast error"
              >
                {feedbackError}
              </motion.div>
            )}
            {feedbackSuccess && (
              <motion.div
                key="toast-success"
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="admin-toast success"
              >
                {feedbackSuccess}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="admin-tabs">
          <button
            type="button"
            className={activeTab === 'users' ? 'active' : ''}
            onClick={() => handleTabChange('users')}
          >
            <Users size={16} />
            <span>用户</span>
          </button>
          <button
            type="button"
            className={activeTab === 'clients' ? 'active' : ''}
            onClick={() => handleTabChange('clients')}
          >
            <AppWindow size={16} />
            <span>应用</span>
          </button>
          <button
            type="button"
            className={activeTab === 'grants' ? 'active' : ''}
            onClick={() => handleTabChange('grants')}
          >
            <ShieldCheck size={16} />
            <span>授权记录</span>
          </button>
          <button
            type="button"
            className={activeTab === 'access-requests' ? 'active' : ''}
            onClick={() => handleTabChange('access-requests')}
          >
            <FileClock size={16} />
            <span>接入申请</span>
          </button>
        </nav>

        <AnimatePresence mode="wait">
          {activeTab === 'users' && (
            <motion.section
              key="tab-users"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="admin-card glass"
            >
            <header className="admin-card-head">
              <h2>
                <UserRoundCog size={18} />
                <span>用户管理</span>
              </h2>
              <div className="admin-query-row">
                <input
                  value={usersQuery}
                  onChange={(event) => setUsersQuery(event.target.value)}
                  placeholder="按邮箱或用户名搜索"
                />
                <select
                  value={usersRoleFilter}
                  onChange={(event) => setUsersRoleFilter(event.target.value)}
                >
                  <option value="">全部角色</option>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <select
                  value={usersActiveFilter}
                  onChange={(event) => setUsersActiveFilter(event.target.value)}
                >
                  <option value="">全部状态</option>
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={usersLoading}
                  onClick={() => void loadUsers(1)}
                >
                  <Search size={14} />
                  <span>查询</span>
                </button>
              </div>
            </header>

            {usersLoading ? (
              <div className="admin-placeholder">正在加载用户列表...</div>
            ) : users.length === 0 ? (
              <div className="admin-placeholder">暂无用户数据。</div>
            ) : (
              <ul className="admin-list">
                {users.map((item) => {
                  const busy = userUpdatingId === item.id;
                  return (
                    <li key={item.id} className="admin-list-item">
                      <div className="admin-list-main">
                        <strong>{item.display_name || item.email}</strong>
                        <p>{item.email}</p>
                        <p>
                          role={item.role} / level={item.admin_level} /{' '}
                          {item.is_active ? 'active' : 'inactive'}
                        </p>
                        <p>创建时间：{formatDateTime(item.created_at)}</p>
                      </div>
                      <div className="admin-list-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            void updateUser(
                              item.id,
                              { is_active: !item.is_active },
                              item.is_active ? '用户已禁用。' : '用户已启用。'
                            )
                          }
                        >
                          {item.is_active ? '禁用' : '启用'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            void updateUser(
                              item.id,
                              {
                                role: item.role === 'admin' ? 'user' : 'admin',
                                admin_level: item.role === 'admin' ? 0 : 1,
                              },
                              item.role === 'admin' ? '已降级为普通用户。' : '已提升为管理员。'
                            )
                          }
                        >
                          {item.role === 'admin' ? '降级' : '提升'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy || item.role !== 'admin'}
                          onClick={() =>
                            void updateUser(
                              item.id,
                              { admin_level: item.admin_level + 1 },
                              '管理员等级已提升。'
                            )
                          }
                        >
                          等级+1
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <footer className="admin-pagination">
              <span>
                第 {usersPage}/{usersTotalPages} 页 · 共 {usersTotal} 条
              </span>
              <div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={usersPage <= 1 || usersLoading}
                  onClick={() => void loadUsers(usersPage - 1)}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={usersPage >= usersTotalPages || usersLoading}
                  onClick={() => void loadUsers(usersPage + 1)}
                >
                  下一页
                </button>
              </div>
            </footer>
            </motion.section>
          )}

          {activeTab === 'clients' && (
            <motion.section
              key="tab-clients"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="admin-card glass"
            >
            <header className="admin-card-head">
              <h2>
                <AppWindow size={18} />
                <span>应用管理</span>
              </h2>
              <div className="admin-query-row">
                <input
                  value={clientsQuery}
                  onChange={(event) => setClientsQuery(event.target.value)}
                  placeholder="按 client_id 或应用名称搜索"
                />
                <select
                  value={clientsActiveFilter}
                  onChange={(event) => setClientsActiveFilter(event.target.value)}
                >
                  <option value="">全部状态</option>
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={clientsLoading}
                  onClick={() => void loadClients(1)}
                >
                  <Search size={14} />
                  <span>查询</span>
                </button>
                <button type="button" className="btn-primary" onClick={openCreateClientModal}>
                  <Plus size={14} />
                  <span>创建应用</span>
                </button>
              </div>
            </header>

            {createdClientSecret && (
              <div className="admin-inline-note">
                最新生成的 `client_secret`：{createdClientSecret}
              </div>
            )}

            {clientsLoading ? (
              <div className="admin-placeholder">正在加载应用列表...</div>
            ) : clients.length === 0 ? (
              <div className="admin-placeholder">暂无应用数据。</div>
            ) : (
              <ul className="admin-list">
                {clients.map((item) => (
                  <li key={item.client_id} className="admin-list-item">
                    <div className="admin-list-main">
                      <strong>{item.client_name}</strong>
                      <p>{item.client_id}</p>
                      <p>
                        {item.client_type} / {item.is_active ? 'active' : 'inactive'}
                      </p>
                      <p>
                        <Link2 size={13} /> redirect: {item.redirect_uris.join(', ') || '-'}
                      </p>
                      <p>scopes: {item.scopes.join(' ') || '-'}</p>
                      <p>allowed audiences: {item.allowed_audiences.join(' ') || '-'}</p>
                    </div>
                    <div className="admin-list-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={clientUpdatingId === item.client_id}
                        onClick={() =>
                          void updateClient(
                            item.client_id,
                            { is_active: !item.is_active },
                            item.is_active ? '应用已禁用。' : '应用已启用。'
                          )
                        }
                      >
                        {item.is_active ? '禁用' : '启用'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => openEditClientModal(item)}
                      >
                        <PencilLine size={14} />
                        <span>编辑</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <footer className="admin-pagination">
              <span>
                第 {clientsPage}/{clientsTotalPages} 页 · 共 {clientsTotal} 条
              </span>
              <div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={clientsPage <= 1 || clientsLoading}
                  onClick={() => void loadClients(clientsPage - 1)}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={clientsPage >= clientsTotalPages || clientsLoading}
                  onClick={() => void loadClients(clientsPage + 1)}
                >
                  下一页
                </button>
              </div>
            </footer>
            </motion.section>
          )}

          {activeTab === 'access-requests' && (
            <motion.section
              key="tab-requests"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="admin-card glass"
            >
            <header className="admin-card-head">
              <h2>
                <FileClock size={18} />
                <span>接入申请审批</span>
              </h2>
              <div className="admin-query-row">
                <input
                  value={accessRequestsQuery}
                  onChange={(event) => setAccessRequestsQuery(event.target.value)}
                  placeholder="按邮箱/站点名/URL 搜索"
                />
                <select
                  value={accessRequestsStatusFilter}
                  onChange={(event) => setAccessRequestsStatusFilter(event.target.value)}
                >
                  <option value="">全部状态</option>
                  <option value={ClientAccessRequestStatus.Pending}>pending</option>
                  <option value={ClientAccessRequestStatus.Approved}>approved</option>
                  <option value={ClientAccessRequestStatus.Rejected}>rejected</option>
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={accessRequestsLoading}
                  onClick={() => void loadAccessRequests(1)}
                >
                  <Search size={14} />
                  <span>查询</span>
                </button>
              </div>
            </header>

            {accessRequestsLoading ? (
              <div className="admin-placeholder">正在加载接入申请...</div>
            ) : accessRequests.length === 0 ? (
              <div className="admin-placeholder">暂无接入申请数据。</div>
            ) : (
              <ul className="admin-list">
                {accessRequests.map((item) => (
                  <li key={item.id} className="admin-list-item">
                    <div className="admin-list-main">
                      <strong>{item.site_name}</strong>
                      <p>
                        user: {item.user_email} · status:{' '}
                        <span
                          className={`admin-status-tag ${clientAccessRequestStatusMeta[item.status].className}`}
                        >
                          {clientAccessRequestStatusMeta[item.status].label}
                        </span>
                      </p>
                      <p>url: {item.site_url}</p>
                      <p>描述: {item.request_description}</p>
                      <p>提交时间: {formatDateTime(item.created_at)}</p>
                      {item.resolved_at && <p>处理时间: {formatDateTime(item.resolved_at)}</p>}
                      {item.admin_note && <p>处理备注: {item.admin_note}</p>}
                    </div>
                    <div className="admin-list-actions">
                      {item.status === ClientAccessRequestStatus.Pending ? (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => openApproveRequestModal(item)}
                          >
                            <CheckCircle2 size={14} />
                            <span>通过</span>
                          </button>
                          <button
                            type="button"
                            className="btn-secondary danger"
                            onClick={() => openRejectRequestModal(item)}
                          >
                            <XCircle size={14} />
                            <span>拒绝</span>
                          </button>
                        </>
                      ) : (
                        <span className="admin-inline-note">已处理</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <footer className="admin-pagination">
              <span>
                第 {accessRequestsPage}/{accessRequestsTotalPages} 页 · 共 {accessRequestsTotal}{' '}
                条
              </span>
              <div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={accessRequestsPage <= 1 || accessRequestsLoading}
                  onClick={() => void loadAccessRequests(accessRequestsPage - 1)}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={
                    accessRequestsPage >= accessRequestsTotalPages || accessRequestsLoading
                  }
                  onClick={() => void loadAccessRequests(accessRequestsPage + 1)}
                >
                  下一页
                </button>
              </div>
            </footer>
            </motion.section>
          )}

          {activeTab === 'grants' && (
            <motion.section
              key="tab-grants"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="admin-card glass"
            >
            <header className="admin-card-head">
              <h2>
                <ShieldCheck size={18} />
                <span>授权记录</span>
              </h2>
              <div className="admin-query-row">
                <input
                  value={grantsQuery}
                  onChange={(event) => setGrantsQuery(event.target.value)}
                  placeholder="按邮箱/client_id/应用名搜索"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={grantsLoading}
                  onClick={() => void loadGrants(1)}
                >
                  <Search size={14} />
                  <span>查询</span>
                </button>
              </div>
            </header>

            {grantsLoading ? (
              <div className="admin-placeholder">正在加载授权记录...</div>
            ) : grants.length === 0 ? (
              <div className="admin-placeholder">暂无授权记录。</div>
            ) : (
              <ul className="admin-list">
                {grants.map((item) => {
                  const key = `${item.user_id}:${item.client_id}`;
                  return (
                    <li key={key} className="admin-list-item">
                      <div className="admin-list-main">
                        <strong>{item.client_name}</strong>
                        <p>client: {item.client_id}</p>
                        <p>user: {item.email}</p>
                        <p>最近授权：{formatDateTime(item.last_authorized_at)}</p>
                        <p>scope: {item.last_scopes.join(' ') || '-'}</p>
                      </div>
                      <div className="admin-list-actions">
                        <button
                          type="button"
                          className="btn-secondary danger"
                          disabled={revokingGrantKey === key}
                          onClick={() => void handleRevokeGrant(item)}
                        >
                          <Ban size={14} />
                          <span>{revokingGrantKey === key ? '撤销中...' : '撤销授权'}</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <footer className="admin-pagination">
              <span>
                第 {grantsPage}/{grantsTotalPages} 页 · 共 {grantsTotal} 条
              </span>
              <div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={grantsPage <= 1 || grantsLoading}
                  onClick={() => void loadGrants(grantsPage - 1)}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={grantsPage >= grantsTotalPages || grantsLoading}
                  onClick={() => void loadGrants(grantsPage + 1)}
                >
                  下一页
                </button>
              </div>
            </footer>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showCreateClientModal && (
          <motion.div
            className="admin-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !creatingClient) {
                setShowCreateClientModal(false);
              }
            }}
          >
            <motion.section
              className="glass admin-modal"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
            >
            <header className="admin-modal-head">
              <div>
                <h2>创建应用</h2>
                <p>使用标准化字段创建 OAuth 客户端。</p>
              </div>
              <button
                type="button"
                className="btn-secondary admin-modal-close"
                onClick={() => setShowCreateClientModal(false)}
                disabled={creatingClient}
              >
                <X size={14} />
              </button>
            </header>

            <form className="admin-form admin-modal-form" onSubmit={handleCreateClient}>
              <label>
                应用名称
                <input
                  value={createClientForm.clientName}
                  onChange={(event) =>
                    setCreateFormWithRules((prev) => ({ ...prev, clientName: event.target.value }))
                  }
                  placeholder="例如：nazo-docs"
                />
              </label>

              <fieldset className="admin-fieldset">
                <legend>客户端类型</legend>
                <div className="admin-option-grid">
                  <label
                    className={`admin-option-item ${
                      createClientForm.clientType === 'public' ? 'active' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="create_client_type"
                      checked={createClientForm.clientType === 'public'}
                      onChange={() =>
                        setCreateFormWithRules((prev) => ({ ...prev, clientType: 'public' }))
                      }
                    />
                    <span>public</span>
                    <small>前端/浏览器应用</small>
                  </label>
                  <label
                    className={`admin-option-item ${
                      createClientForm.clientType === 'confidential' ? 'active' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="create_client_type"
                      checked={createClientForm.clientType === 'confidential'}
                      onChange={() =>
                        setCreateFormWithRules((prev) => ({
                          ...prev,
                          clientType: 'confidential',
                        }))
                      }
                    />
                    <span>confidential</span>
                    <small>服务端可安全保存密钥</small>
                  </label>
                </div>
              </fieldset>

              <label>
                token_endpoint_auth_method
                <select
                  value={createClientForm.tokenEndpointAuthMethod}
                  disabled={createClientForm.clientType === 'public'}
                  onChange={(event) =>
                    setCreateFormWithRules((prev) => ({
                      ...prev,
                      tokenEndpointAuthMethod: event.target.value as AuthMethodValue,
                    }))
                  }
                >
                  {createClientForm.clientType === 'public' ? (
                    <option value="none">none</option>
                  ) : (
                    <>
                      <option value="client_secret_basic">client_secret_basic</option>
                      <option value="client_secret_post">client_secret_post</option>
                    </>
                  )}
                </select>
              </label>

              <fieldset className="admin-fieldset">
                <legend>回调地址</legend>
                <div className="admin-uri-list">
                  {createClientForm.redirectUris.map((uri, index) => (
                    <div key={`create-uri-${index}`} className="admin-uri-item">
                      <input
                        value={uri}
                        onChange={(event) =>
                          setCreateFormWithRules((prev) => ({
                            ...prev,
                            redirectUris: prev.redirectUris.map((value, valueIndex) =>
                              valueIndex === index ? event.target.value : value
                            ),
                          }))
                        }
                        placeholder="https://app.example.com/callback"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setCreateFormWithRules((prev) => ({
                            ...prev,
                            redirectUris:
                              prev.redirectUris.length <= 1
                                ? prev.redirectUris
                                : prev.redirectUris.filter(
                                    (_value, valueIndex) => valueIndex !== index
                                  ),
                          }))
                        }
                        disabled={createClientForm.redirectUris.length <= 1}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="admin-uri-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setCreateFormWithRules((prev) => ({
                        ...prev,
                        redirectUris: [...prev.redirectUris, ''],
                      }))
                    }
                  >
                    <Plus size={14} />
                    <span>添加回调地址</span>
                  </button>
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Scopes {scopesLoading ? '（同步中）' : ''}</legend>
                <div className="admin-option-grid compact">
                  {availableScopeOptions.map((scope) => (
                    <label
                      key={`create-scope-${scope}`}
                      className={`admin-option-item checkbox ${
                        createClientForm.scopes.includes(scope) ? 'active' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={createClientForm.scopes.includes(scope)}
                        onChange={() =>
                          setCreateFormWithRules((prev) => ({
                            ...prev,
                            scopes: toggleSelection(prev.scopes, scope),
                          }))
                        }
                      />
                      <span>{scope}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Allowed Audiences</legend>
                <div className="admin-uri-list">
                  {createClientForm.allowedAudiences.map((audience, index) => (
                    <div key={`create-audience-${index}`} className="admin-uri-item">
                      <input
                        value={audience}
                        onChange={(event) =>
                          setCreateFormWithRules((prev) => ({
                            ...prev,
                            allowedAudiences: prev.allowedAudiences.map(
                              (value, valueIndex) =>
                                valueIndex === index ? event.target.value : value
                            ),
                          }))
                        }
                        placeholder="resource://default"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setCreateFormWithRules((prev) => ({
                            ...prev,
                            allowedAudiences:
                              prev.allowedAudiences.length <= 1
                                ? prev.allowedAudiences
                                : prev.allowedAudiences.filter(
                                    (_value, valueIndex) => valueIndex !== index
                                  ),
                          }))
                        }
                        disabled={createClientForm.allowedAudiences.length <= 1}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="admin-uri-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setCreateFormWithRules((prev) => ({
                        ...prev,
                        allowedAudiences: [...prev.allowedAudiences, ''],
                      }))
                    }
                  >
                    <Plus size={14} />
                    <span>添加 audience</span>
                  </button>
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Grant Types</legend>
                <div className="admin-option-grid compact">
                  {GRANT_TYPE_OPTIONS.map((grant) => {
                    const disabled =
                      createClientForm.clientType === 'public' &&
                      grant.value === 'client_credentials';
                    return (
                      <label
                        key={`create-grant-${grant.value}`}
                        className={`admin-option-item checkbox ${
                          createClientForm.grantTypes.includes(grant.value) ? 'active' : ''
                        } ${disabled ? 'disabled' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={createClientForm.grantTypes.includes(grant.value)}
                          disabled={disabled}
                          onChange={() =>
                            setCreateFormWithRules((prev) => ({
                              ...prev,
                              grantTypes: toggleSelection(prev.grantTypes, grant.value),
                            }))
                          }
                        />
                        <span>{grant.label}</span>
                        <small>{grant.description}</small>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {createdClientSecret && (
                <div className="admin-inline-note">
                  新创建客户端的 `client_secret`：{createdClientSecret}
                </div>
              )}

              <footer className="admin-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={creatingClient}
                  onClick={() => setShowCreateClientModal(false)}
                >
                  关闭
                </button>
                <button type="submit" className="btn-primary" disabled={creatingClient}>
                  {creatingClient ? '创建中...' : '创建应用'}
                </button>
              </footer>
            </form>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showEditClientModal && editClientForm && (
          <motion.div
            className="admin-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !savingClientEdit) {
                setShowEditClientModal(false);
              }
            }}
          >
            <motion.section
              className="glass admin-modal"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
            >
            <header className="admin-modal-head">
              <div>
                <h2>编辑应用</h2>
                <p>{editClientId}</p>
              </div>
              <button
                type="button"
                className="btn-secondary admin-modal-close"
                onClick={() => setShowEditClientModal(false)}
                disabled={savingClientEdit}
              >
                <X size={14} />
              </button>
            </header>

            <form className="admin-form admin-modal-form" onSubmit={handleSaveClientEdit}>
              <div className="admin-readonly-grid">
                <div className="admin-readonly-row">
                  <span>client_type</span>
                  <strong>{editClientForm.clientType}</strong>
                </div>
                <div className="admin-readonly-row">
                  <span>token_endpoint_auth_method</span>
                  <strong>{editClientForm.tokenEndpointAuthMethod}</strong>
                </div>
              </div>

              <label>
                应用名称
                <input
                  value={editClientForm.clientName}
                  onChange={(event) =>
                    setEditFormWithRules((prev) => ({ ...prev, clientName: event.target.value }))
                  }
                  placeholder="应用名称"
                />
              </label>

              <label>
                启用状态
                <select
                  value={String(editClientForm.isActive)}
                  onChange={(event) =>
                    setEditFormWithRules((prev) => ({
                      ...prev,
                      isActive: event.target.value === 'true',
                    }))
                  }
                >
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
              </label>

              <fieldset className="admin-fieldset">
                <legend>回调地址</legend>
                <div className="admin-uri-list">
                  {editClientForm.redirectUris.map((uri, index) => (
                    <div key={`edit-uri-${index}`} className="admin-uri-item">
                      <input
                        value={uri}
                        onChange={(event) =>
                          setEditFormWithRules((prev) => ({
                            ...prev,
                            redirectUris: prev.redirectUris.map((value, valueIndex) =>
                              valueIndex === index ? event.target.value : value
                            ),
                          }))
                        }
                        placeholder="https://app.example.com/callback"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setEditFormWithRules((prev) => ({
                            ...prev,
                            redirectUris:
                              prev.redirectUris.length <= 1
                                ? prev.redirectUris
                                : prev.redirectUris.filter(
                                    (_value, valueIndex) => valueIndex !== index
                                  ),
                          }))
                        }
                        disabled={editClientForm.redirectUris.length <= 1}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="admin-uri-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setEditFormWithRules((prev) => ({
                        ...prev,
                        redirectUris: [...prev.redirectUris, ''],
                      }))
                    }
                  >
                    <Plus size={14} />
                    <span>添加回调地址</span>
                  </button>
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Scopes</legend>
                <div className="admin-option-grid compact">
                  {availableScopeOptions.map((scope) => (
                    <label
                      key={`edit-scope-${scope}`}
                      className={`admin-option-item checkbox ${
                        editClientForm.scopes.includes(scope) ? 'active' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={editClientForm.scopes.includes(scope)}
                        onChange={() =>
                          setEditFormWithRules((prev) => ({
                            ...prev,
                            scopes: toggleSelection(prev.scopes, scope),
                          }))
                        }
                      />
                      <span>{scope}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Allowed Audiences</legend>
                <div className="admin-uri-list">
                  {editClientForm.allowedAudiences.map((audience, index) => (
                    <div key={`edit-audience-${index}`} className="admin-uri-item">
                      <input
                        value={audience}
                        onChange={(event) =>
                          setEditFormWithRules((prev) => ({
                            ...prev,
                            allowedAudiences: prev.allowedAudiences.map(
                              (value, valueIndex) =>
                                valueIndex === index ? event.target.value : value
                            ),
                          }))
                        }
                        placeholder="resource://default"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setEditFormWithRules((prev) => ({
                            ...prev,
                            allowedAudiences:
                              prev.allowedAudiences.length <= 1
                                ? prev.allowedAudiences
                                : prev.allowedAudiences.filter(
                                    (_value, valueIndex) => valueIndex !== index
                                  ),
                          }))
                        }
                        disabled={editClientForm.allowedAudiences.length <= 1}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="admin-uri-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setEditFormWithRules((prev) => ({
                        ...prev,
                        allowedAudiences: [...prev.allowedAudiences, ''],
                      }))
                    }
                  >
                    <Plus size={14} />
                    <span>添加 audience</span>
                  </button>
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Grant Types</legend>
                <div className="admin-option-grid compact">
                  {GRANT_TYPE_OPTIONS.map((grant) => {
                    const disabled =
                      editClientForm.clientType === 'public' &&
                      grant.value === 'client_credentials';
                    return (
                      <label
                        key={`edit-grant-${grant.value}`}
                        className={`admin-option-item checkbox ${
                          editClientForm.grantTypes.includes(grant.value) ? 'active' : ''
                        } ${disabled ? 'disabled' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={editClientForm.grantTypes.includes(grant.value)}
                          disabled={disabled}
                          onChange={() =>
                            setEditFormWithRules((prev) => ({
                              ...prev,
                              grantTypes: toggleSelection(prev.grantTypes, grant.value),
                            }))
                          }
                        />
                        <span>{grant.label}</span>
                        <small>{grant.description}</small>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <footer className="admin-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingClientEdit}
                  onClick={() => setShowEditClientModal(false)}
                >
                  取消
                </button>
                <button type="submit" className="btn-primary" disabled={savingClientEdit}>
                  {savingClientEdit ? '保存中...' : '保存修改'}
                </button>
              </footer>
            </form>
          </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showApproveRequestModal && selectedAccessRequest && approveRequestForm && (
          <motion.div
            className="admin-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !approvingRequest) {
                setShowApproveRequestModal(false);
              }
            }}
          >
            <motion.section
              className="glass admin-modal"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
            >
            <header className="admin-modal-head">
              <div>
                <h2>审批通过申请</h2>
                <p>{selectedAccessRequest.user_email}</p>
              </div>
              <button
                type="button"
                className="btn-secondary admin-modal-close"
                onClick={() => setShowApproveRequestModal(false)}
                disabled={approvingRequest}
              >
                <X size={14} />
              </button>
            </header>

            <form className="admin-form admin-modal-form" onSubmit={handleApproveAccessRequest}>
              <div className="admin-readonly-grid">
                <div className="admin-readonly-row">
                  <span>站点名</span>
                  <strong>{selectedAccessRequest.site_name}</strong>
                </div>
                <div className="admin-readonly-row">
                  <span>站点 URL</span>
                  <strong>{selectedAccessRequest.site_url}</strong>
                </div>
              </div>

              <label>
                应用名称
                <input
                  value={approveRequestForm.clientName}
                  onChange={(event) =>
                    setApproveFormWithRules((prev) => ({
                      ...prev,
                      clientName: event.target.value,
                    }))
                  }
                  placeholder="审批后生成的客户端名称"
                />
              </label>

              <fieldset className="admin-fieldset">
                <legend>客户端类型</legend>
                <div className="admin-option-grid">
                  <label
                    className={`admin-option-item ${
                      approveRequestForm.clientType === 'public' ? 'active' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="approve_client_type"
                      checked={approveRequestForm.clientType === 'public'}
                      onChange={() =>
                        setApproveFormWithRules((prev) => ({ ...prev, clientType: 'public' }))
                      }
                    />
                    <span>public</span>
                    <small>无 client_secret</small>
                  </label>
                  <label
                    className={`admin-option-item ${
                      approveRequestForm.clientType === 'confidential' ? 'active' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="approve_client_type"
                      checked={approveRequestForm.clientType === 'confidential'}
                      onChange={() =>
                        setApproveFormWithRules((prev) => ({
                          ...prev,
                          clientType: 'confidential',
                        }))
                      }
                    />
                    <span>confidential</span>
                    <small>将生成 client_secret</small>
                  </label>
                </div>
              </fieldset>

              <label>
                token_endpoint_auth_method
                <select
                  value={approveRequestForm.tokenEndpointAuthMethod}
                  disabled={approveRequestForm.clientType === 'public'}
                  onChange={(event) =>
                    setApproveFormWithRules((prev) => ({
                      ...prev,
                      tokenEndpointAuthMethod: event.target.value as AuthMethodValue,
                    }))
                  }
                >
                  {approveRequestForm.clientType === 'public' ? (
                    <option value="none">none</option>
                  ) : (
                    <>
                      <option value="client_secret_basic">client_secret_basic</option>
                      <option value="client_secret_post">client_secret_post</option>
                    </>
                  )}
                </select>
              </label>

              <fieldset className="admin-fieldset">
                <legend>回调地址</legend>
                <div className="admin-uri-list">
                  {approveRequestForm.redirectUris.map((uri, index) => (
                    <div key={`approve-uri-${index}`} className="admin-uri-item">
                      <input
                        value={uri}
                        onChange={(event) =>
                          setApproveFormWithRules((prev) => ({
                            ...prev,
                            redirectUris: prev.redirectUris.map((value, valueIndex) =>
                              valueIndex === index ? event.target.value : value
                            ),
                          }))
                        }
                        placeholder="https://app.example.com/callback"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setApproveFormWithRules((prev) => ({
                            ...prev,
                            redirectUris:
                              prev.redirectUris.length <= 1
                                ? prev.redirectUris
                                : prev.redirectUris.filter(
                                    (_value, valueIndex) => valueIndex !== index
                                  ),
                          }))
                        }
                        disabled={approveRequestForm.redirectUris.length <= 1}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="admin-uri-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setApproveFormWithRules((prev) => ({
                        ...prev,
                        redirectUris: [...prev.redirectUris, ''],
                      }))
                    }
                  >
                    <Plus size={14} />
                    <span>添加回调地址</span>
                  </button>
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Scopes {scopesLoading ? '（同步中）' : ''}</legend>
                <div className="admin-option-grid compact">
                  {availableScopeOptions.map((scope) => (
                    <label
                      key={`approve-scope-${scope}`}
                      className={`admin-option-item checkbox ${
                        approveRequestForm.scopes.includes(scope) ? 'active' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={approveRequestForm.scopes.includes(scope)}
                        onChange={() =>
                          setApproveFormWithRules((prev) => ({
                            ...prev,
                            scopes: toggleSelection(prev.scopes, scope),
                          }))
                        }
                      />
                      <span>{scope}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Allowed Audiences</legend>
                <div className="admin-uri-list">
                  {approveRequestForm.allowedAudiences.map((audience, index) => (
                    <div key={`approve-audience-${index}`} className="admin-uri-item">
                      <input
                        value={audience}
                        onChange={(event) =>
                          setApproveFormWithRules((prev) => ({
                            ...prev,
                            allowedAudiences: prev.allowedAudiences.map(
                              (value, valueIndex) =>
                                valueIndex === index ? event.target.value : value
                            ),
                          }))
                        }
                        placeholder="resource://default"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setApproveFormWithRules((prev) => ({
                            ...prev,
                            allowedAudiences:
                              prev.allowedAudiences.length <= 1
                                ? prev.allowedAudiences
                                : prev.allowedAudiences.filter(
                                    (_value, valueIndex) => valueIndex !== index
                                  ),
                          }))
                        }
                        disabled={approveRequestForm.allowedAudiences.length <= 1}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="admin-uri-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setApproveFormWithRules((prev) => ({
                        ...prev,
                        allowedAudiences: [...prev.allowedAudiences, ''],
                      }))
                    }
                  >
                    <Plus size={14} />
                    <span>添加 audience</span>
                  </button>
                </div>
              </fieldset>

              <fieldset className="admin-fieldset">
                <legend>Grant Types</legend>
                <div className="admin-option-grid compact">
                  {GRANT_TYPE_OPTIONS.map((grant) => {
                    const disabled =
                      approveRequestForm.clientType === 'public' &&
                      grant.value === 'client_credentials';
                    return (
                      <label
                        key={`approve-grant-${grant.value}`}
                        className={`admin-option-item checkbox ${
                          approveRequestForm.grantTypes.includes(grant.value) ? 'active' : ''
                        } ${disabled ? 'disabled' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={approveRequestForm.grantTypes.includes(grant.value)}
                          disabled={disabled}
                          onChange={() =>
                            setApproveFormWithRules((prev) => ({
                              ...prev,
                              grantTypes: toggleSelection(prev.grantTypes, grant.value),
                            }))
                          }
                        />
                        <span>{grant.label}</span>
                        <small>{grant.description}</small>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label>
                审批备注（可选）
                <textarea
                  value={approveRequestAdminNote}
                  onChange={(event) => setApproveRequestAdminNote(event.target.value)}
                  rows={3}
                  placeholder="将随审批结果记录展示给申请人"
                />
              </label>

              <footer className="admin-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={approvingRequest}
                  onClick={() => setShowApproveRequestModal(false)}
                >
                  取消
                </button>
                <button type="submit" className="btn-primary" disabled={approvingRequest}>
                  {approvingRequest ? '处理中...' : '确认通过并发送邮件'}
                </button>
              </footer>
            </form>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRejectRequestModal && selectedAccessRequest && (
          <motion.div
            className="admin-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !rejectingRequest) {
                setShowRejectRequestModal(false);
              }
            }}
          >
            <motion.section
              className="glass admin-modal admin-modal-compact"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
            >
              <header className="admin-modal-head">
                <div>
                  <h2>拒绝接入申请</h2>
                  <p>{selectedAccessRequest.user_email}</p>
                </div>
              <button
                type="button"
                className="btn-secondary admin-modal-close"
                onClick={() => setShowRejectRequestModal(false)}
                disabled={rejectingRequest}
              >
                <X size={14} />
              </button>
            </header>

            <form className="admin-form admin-modal-form" onSubmit={handleRejectAccessRequest}>
              <div className="admin-readonly-row">
                <span>申请信息</span>
                <strong>
                  {selectedAccessRequest.site_name} · {selectedAccessRequest.site_url}
                </strong>
              </div>
              <label>
                拒绝原因（将通过邮件发送给申请人）
                <textarea
                  value={rejectRequestAdminNote}
                  onChange={(event) => setRejectRequestAdminNote(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="例如：回调地址不符合规范，请提供 HTTPS 回调地址。"
                />
              </label>

              <footer className="admin-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={rejectingRequest}
                  onClick={() => setShowRejectRequestModal(false)}
                >
                  取消
                </button>
                <button type="submit" className="btn-secondary danger" disabled={rejectingRequest}>
                  {rejectingRequest ? '处理中...' : '确认拒绝并发送邮件'}
                </button>
              </footer>
            </form>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
