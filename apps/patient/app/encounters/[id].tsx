import { feature010CommonCopy, feature010PatientEncounterChatCopy, isolateLtr } from '@shifaa/i18n';
import {
  color,
  FocusVisiblePressable,
  localizedType,
  radius,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePatientLocaleController } from '../../src/locale-context';
import { patientAccessTokens, patientPlatform } from '../../src/patient-auth-store';
import { resolvePatientApiBaseUrl } from '../../src/patient-api-base-url';
import {
  PatientFeature010EncounterApi,
  patientEncounterCopy,
  type PatientEncounterReadState,
} from '../../src/feature-010-encounter';
import { PatientFeature010ChatApi } from '../../src/feature-010-chat';
import type { MessageProjection } from '@shifaa/contracts';

type ChatViewState =
  | 'idle'
  | 'loading'
  | 'reconnecting'
  | 'current'
  | 'stale'
  | 'offline'
  | 'denied'
  | 'error'
  | 'ended';
type ActingRole = 'PAT' | 'GUA' | 'DEL';

export default function PatientEncounterRoute() {
  const { id, actingRole } = useLocalSearchParams<{ id: string; actingRole?: string }>();
  const role: ActingRole = actingRole === 'GUA' || actingRole === 'DEL' ? actingRole : 'PAT';
  return <PatientEncounterScreen key={`${id}:${role}`} encounterId={id} actorRole={role} />;
}

function PatientEncounterScreen({
  encounterId,
  actorRole,
}: {
  encounterId: string;
  actorRole: ActingRole;
}) {
  const { locale, setLocale } = usePatientLocaleController();
  const common = feature010CommonCopy[locale];
  const copy = patientEncounterCopy[locale];
  const chat = feature010PatientEncounterChatCopy[locale];
  const [state, setState] = useState<PatientEncounterReadState>('loading');
  const [chatState, setChatState] = useState<ChatViewState>('loading');
  const [encounter, setEncounter] = useState<Awaited<
    ReturnType<PatientFeature010EncounterApi['getEncounter']>
  > | null>(null);
  const [messages, setMessages] = useState<MessageProjection[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<'blank' | 'request' | null>(null);
  const [sentMessage, setSentMessage] = useState<MessageProjection | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const activeChatRequest = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const apiBaseUrl = resolvePatientApiBaseUrl({
    platform: patientPlatform,
    configuredBaseUrl: process.env['EXPO_PUBLIC_API_BASE_URL'],
    ...(typeof globalThis.location?.origin === 'string'
      ? { webOrigin: globalThis.location.origin }
      : {}),
  });
  const encounterApi = useMemo(
    () =>
      new PatientFeature010EncounterApi({
        locale,
        accessToken: () => patientAccessTokens.read(),
        apiBaseUrl,
      }),
    [locale, apiBaseUrl],
  );
  const chatApi = useMemo(
    () =>
      new PatientFeature010ChatApi({
        locale,
        accessToken: () => patientAccessTokens.read(),
        apiBaseUrl,
      }),
    [locale, apiBaseUrl],
  );

  const abortRequests = useCallback(() => {
    requestGeneration.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    activeChatRequest.current?.abort();
    activeChatRequest.current = null;
  }, []);

  const loadMessages = useCallback(
    async (generation: number, appointmentId: string, cursor?: string, reconnecting = false) => {
      activeChatRequest.current?.abort();
      const controller = new AbortController();
      activeChatRequest.current = controller;
      if (cursor) setSentMessage(null);
      setChatState(reconnecting ? 'reconnecting' : 'loading');
      try {
        const page = await chatApi.listMessages(
          appointmentId,
          { ...(cursor ? { cursor } : {}) },
          controller.signal,
        );
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        if (page.meta.stale) {
          setMessages([]);
          setNextCursor(null);
          setLastUpdatedAt(page.meta.lastUpdatedAt);
          setSentMessage(null);
          setDraft('');
          setSendError(null);
          setSending(false);
          setChatState('stale');
          return;
        }
        setMessages((current) =>
          cursor
            ? [
                ...current,
                ...page.data.filter((item) => !current.some((existing) => existing.id === item.id)),
              ]
            : page.data,
        );
        setNextCursor(page.meta.nextCursor);
        setLastUpdatedAt(page.meta.lastUpdatedAt);
        setChatState('current');
      } catch {
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        setMessages([]);
        setNextCursor(null);
        if (chatApi.readState !== 'stale') setLastUpdatedAt(null);
        setSentMessage(null);
        setDraft('');
        setSendError(null);
        setSending(false);
        setChatState(
          chatApi.readState === 'denied'
            ? 'denied'
            : chatApi.readState === 'offline'
              ? 'offline'
              : chatApi.readState === 'stale'
                ? 'stale'
                : 'error',
        );
      } finally {
        if (activeChatRequest.current === controller) activeChatRequest.current = null;
      }
    },
    [chatApi],
  );

  const load = useCallback(
    async (preserveChatFreshness = false) => {
      abortRequests();
      const generation = requestGeneration.current;
      const controller = new AbortController();
      activeRequest.current = controller;
      setEncounter(null);
      setMessages([]);
      setNextCursor(null);
      if (!preserveChatFreshness) setLastUpdatedAt(null);
      setSentMessage(null);
      setDraft('');
      setSendError(null);
      setSending(false);
      setState('loading');
      setChatState(preserveChatFreshness ? 'reconnecting' : 'loading');
      try {
        const current = await encounterApi.getEncounter(encounterId, controller.signal);
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        setEncounter(current);
        setState(current.status === 'completed' ? 'completed' : 'visible');
        if (current.status === 'completed') {
          setChatState('ended');
          chatApi.markOffline();
          return;
        }
        if (actorRole === 'PAT')
          await loadMessages(generation, current.appointmentId, undefined, preserveChatFreshness);
        else {
          chatApi.markOffline();
          setChatState('denied');
        }
      } catch {
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        setEncounter(null);
        setMessages([]);
        setState(encounterApi.readState);
        setChatState(encounterApi.readState === 'denied' ? 'denied' : 'error');
      } finally {
        if (activeRequest.current === controller) activeRequest.current = null;
      }
    },
    [abortRequests, actorRole, chatApi, encounterApi, encounterId, loadMessages],
  );

  useEffect(() => {
    void load();
    return abortRequests;
  }, [load, abortRequests]);

  useEffect(() => {
    const suspend = () => {
      abortRequests();
      encounterApi.markOffline();
      chatApi.markOffline();
      setEncounter(null);
      setMessages([]);
      setNextCursor(null);
      setSentMessage(null);
      setDraft('');
      setSendError(null);
      setSending(false);
      setState('offline');
      setChatState('offline');
    };
    const offline = () => {
      suspend();
    };
    const online = () => void load(true);
    const foreground = (next: string) => {
      if (next === 'active') void load(true);
      else suspend();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void load(true);
      else suspend();
    };
    const focused = () => void load(true);
    const hint = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (actorRole === 'PAT' && chatApi.handleRefreshHint(detail)) {
        setMessages([]);
        setChatState('stale');
        void load(true);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', offline);
      window.addEventListener('online', online);
      window.addEventListener('focus', focused);
      window.addEventListener('shifaa:feature-010-refresh-hint', hint);
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible);
    const subscription = AppState.addEventListener('change', foreground);
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', offline);
        window.removeEventListener('online', online);
        window.removeEventListener('focus', focused);
        window.removeEventListener('shifaa:feature-010-refresh-hint', hint);
      }
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', visible);
      subscription.remove();
    };
  }, [abortRequests, actorRole, chatApi, encounterApi, load]);

  const send = useCallback(async () => {
    if (
      actorRole !== 'PAT' ||
      chatState !== 'current' ||
      !encounter ||
      encounter.status !== 'open' ||
      !encounter.appointmentId ||
      sending
    )
      return;
    if (!draft.trim()) {
      setSendError('blank');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      chatApi.markOffline();
      setMessages([]);
      setChatState('offline');
      setSentMessage(null);
      setDraft('');
      return;
    }
    const generation = requestGeneration.current;
    const controller = new AbortController();
    activeChatRequest.current?.abort();
    activeChatRequest.current = controller;
    setSending(true);
    setSendError(null);
    try {
      const sent = await chatApi.sendMessage(
        encounter.appointmentId,
        { body: draft },
        `patient-chat-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
        controller.signal,
      );
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      setSentMessage(sent);
      setMessages((current) =>
        current.some((message) => message.id === sent.id) ? current : [sent, ...current],
      );
      setDraft('');
      setChatState('current');
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch {
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      setSendError('request');
      setMessages([]);
      setSentMessage(null);
      setDraft('');
      setChatState(
        chatApi.readState === 'denied' ||
          chatApi.readState === 'offline' ||
          chatApi.readState === 'stale'
          ? chatApi.readState
          : 'stale',
      );
      setLastUpdatedAt(chatApi.lastUpdatedAt);
    } finally {
      if (activeChatRequest.current === controller) activeChatRequest.current = null;
      if (generation === requestGeneration.current) setSending(false);
    }
  }, [actorRole, chatApi, chatState, draft, encounter, sending]);

  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const recordMessage =
    state === 'denied'
      ? copy.denied
      : state === 'offline'
        ? copy.offline
        : state === 'stale'
          ? copy.stale
          : state === 'error'
            ? copy.error
            : state === 'loading'
              ? copy.loading
              : copy.empty;
  const chatMessage =
    chatState === 'denied'
      ? chat.denied
      : chatState === 'reconnecting'
        ? chat.reconnecting
        : chatState === 'offline'
          ? chat.offline
          : chatState === 'stale'
            ? chat.stale
            : chatState === 'error'
              ? chat.error
              : chatState === 'loading'
                ? chat.loading
                : chat.empty;
  const showChat = actorRole === 'PAT';
  const ended = showChat && (state === 'completed' || chatState === 'ended');

  const successNotice =
    showChat && chatState === 'current' && encounter?.status === 'open' && sentMessage ? (
      <View accessibilityRole="summary" style={semanticStyles.card}>
        <Text
          accessibilityRole="header"
          aria-level={2}
          accessibilityLiveRegion="polite"
          style={{ ...localizedType(locale, 'title'), color: color.positive }}
        >
          {chat.success}
        </Text>
        <Text
          style={{
            ...localizedType(locale, 'body'),
            color: color.ink,
            writingDirection: 'ltr',
            textAlign: 'left',
          }}
        >
          {isolateLtr(sentMessage.id)}
        </Text>
        <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
          {isolateLtr(
            new Date(sentMessage.sentAt).toLocaleString(locale, { timeZone: 'Africa/Cairo' }),
          )}
        </Text>
        <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
          {sentMessage.body}
        </Text>
        <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{chat.next}</Text>
      </View>
    ) : null;

  const chatSection = ended ? (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={semanticStyles.card}>
      <Text
        accessibilityRole="header"
        aria-level={2}
        style={{ ...localizedType(locale, 'title'), color: color.warning }}
      >
        {chat.endedTitle}
      </Text>
      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{chat.endedBody}</Text>
    </View>
  ) : (
    <View style={semanticStyles.card}>
      <Text
        accessibilityRole="header"
        aria-level={2}
        style={{ ...localizedType(locale, 'title'), color: color.ink }}
      >
        {chat.messages}
      </Text>
      <Text style={{ ...localizedType(locale, 'body'), color: color.mutedInk }}>{chat.active}</Text>
      {['current', 'stale', 'loading', 'offline'].includes(chatState) && lastUpdatedAt && (
        <Text style={{ ...localizedType(locale, 'label'), color: color.mutedInk }}>
          {chat.lastUpdated}:{' '}
          {isolateLtr(new Date(lastUpdatedAt).toLocaleString(locale, { timeZone: 'Africa/Cairo' }))}
        </Text>
      )}
      {chatState === 'current' && (
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={() => void load(true)}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
            {chat.refresh}
          </Text>
        </FocusVisiblePressable>
      )}
      {chatState !== 'current' && (
        <View
          accessibilityRole={
            chatState === 'denied' || chatState === 'offline' ? 'alert' : 'summary'
          }
          accessibilityLiveRegion="polite"
          style={{ gap: spacing.xs }}
        >
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{chatMessage}</Text>
          {chatState !== 'loading' && chatState !== 'ended' && (
            <FocusVisiblePressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
                {chat.refresh}
              </Text>
            </FocusVisiblePressable>
          )}
        </View>
      )}
      {chatState === 'current' && messages.length === 0 && (
        <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{chat.empty}</Text>
      )}
      {chatState === 'current' &&
        messages
          .filter((message) => message.id !== sentMessage?.id)
          .map((message) => (
            <View key={message.id} style={{ gap: spacing.xs, paddingBlock: spacing.xs }}>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {message.body}
              </Text>
              <Text style={{ ...localizedType(locale, 'label'), color: color.mutedInk }}>
                {isolateLtr(
                  new Date(message.sentAt).toLocaleString(locale, { timeZone: 'Africa/Cairo' }),
                )}
              </Text>
            </View>
          ))}
      {chatState === 'current' && nextCursor && (
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={() =>
            encounter?.appointmentId &&
            void loadMessages(requestGeneration.current, encounter.appointmentId, nextCursor)
          }
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>{chat.more}</Text>
        </FocusVisiblePressable>
      )}
      {chatState === 'current' && encounter?.status === 'open' && (
        <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
          <Text
            accessibilityRole="text"
            style={{ ...localizedType(locale, 'label'), color: color.ink }}
          >
            {chat.body}
          </Text>
          <TextInput
            accessibilityLabel={chat.body}
            multiline
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setSendError(null);
            }}
            style={{
              ...localizedType(locale, 'body'),
              minHeight: 96,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: radius.control,
              padding: spacing.md,
              color: color.ink,
              textAlign: locale === 'ar-EG' ? 'right' : 'left',
              writingDirection: direction,
            }}
          />
          {sendError && (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={{ ...localizedType(locale, 'body'), color: color.danger }}
            >
              {sendError === 'blank' ? chat.blank : chat.error}
            </Text>
          )}
          <FocusVisiblePressable
            accessibilityRole="button"
            accessibilityLabel={sending ? chat.sending : chat.send}
            disabled={sending || !draft.trim()}
            onPress={() => void send()}
            style={{
              minHeight: 48,
              maxWidth: '100%',
              paddingInline: spacing.sm,
              backgroundColor: color.brand,
              borderRadius: radius.control,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                ...localizedType(locale, 'label'),
                color: color.inverse,
                maxWidth: '100%',
                flexShrink: 1,
                textAlign: 'center',
              }}
            >
              {sending ? chat.sending : chat.send}
            </Text>
          </FocusVisiblePressable>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView
      ref={scrollRef}
      role="main"
      contentContainerStyle={{
        ...semanticStyles.screen,
        direction,
        width: '100%',
        maxWidth: 720,
        minHeight: '100%',
        alignSelf: 'center',
        paddingBlock: spacing.lg,
        gap: spacing.md,
      }}
    >
      {successNotice}
      {ended && chatSection}
      <View
        style={{
          width: '100%',
          minWidth: 0,
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: spacing.sm,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            ...localizedType(locale, 'display'),
            color: color.ink,
            minWidth: 0,
            maxWidth: '100%',
            flexShrink: 1,
          }}
        >
          {copy.title}
        </Text>
        <FocusVisiblePressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'ar-EG' ? common.languageEnglish : common.languageArabic}
          onPress={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
          style={{
            minWidth: 44,
            minHeight: 44,
            maxWidth: '100%',
            flexShrink: 0,
            justifyContent: 'center',
          }}
        >
          <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
            {locale === 'ar-EG' ? common.languageEnglish : common.languageArabic}
          </Text>
        </FocusVisiblePressable>
      </View>
      {showChat && chatState === 'reconnecting' && (
        <View
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          style={semanticStyles.card}
        >
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {chat.reconnecting}
          </Text>
          {lastUpdatedAt && (
            <Text style={{ ...localizedType(locale, 'label'), color: color.mutedInk }}>
              {chat.lastUpdated}:{' '}
              {new Date(lastUpdatedAt).toLocaleString(locale, { timeZone: 'Africa/Cairo' })}
            </Text>
          )}
        </View>
      )}
      {!encounter ? (
        <View
          accessibilityRole={
            state === 'denied' || state === 'offline' || state === 'stale' ? 'alert' : 'summary'
          }
          accessibilityLiveRegion="polite"
          style={semanticStyles.card}
        >
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {recordMessage}
          </Text>
          {state !== 'loading' && (
            <FocusVisiblePressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={{ minWidth: 44, minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
                {copy.refresh}
              </Text>
            </FocusVisiblePressable>
          )}
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {showChat && !ended && chatSection}
          <View style={semanticStyles.card}>
            <Text style={{ ...localizedType(locale, 'title'), color: color.ink }}>
              {state === 'completed' ? copy.completed : copy.open}
            </Text>
            <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
              {copy.started}:{' '}
              {isolateLtr(
                new Date(encounter.startedAt).toLocaleString(locale, { timeZone: 'Africa/Cairo' }),
              )}
            </Text>
            {encounter.completionSummary !== undefined && (
              <View style={{ gap: spacing.xs }}>
                <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                  {copy.completion}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {encounter.completionSummary}
                </Text>
              </View>
            )}
          </View>
          {encounter.notes
            ?.filter((note) => note.visibility === 'patient_visible')
            .map((note) => (
              <View key={note.id} style={semanticStyles.card}>
                <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                  {copy.note}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {note.body}
                </Text>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}
