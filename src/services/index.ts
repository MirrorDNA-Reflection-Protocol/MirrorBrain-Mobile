/**
 * Services Index
 */

export { VaultService, STORAGE_PATHS, type MemorySpark } from './vault.service';
export { IdentityService } from './identity.service';
export { LLMService, AVAILABLE_MODELS, type ModelId } from './llm.service';
export { CalendarService, type CalendarEvent } from './calendar.service';
export { VoiceService } from './voice.service';
export { TTSService } from './tts.service';
export { AssistantService, type AssistantConfig, type AssistantEvent, type AssistantTrigger } from './assistant.service';

// Sovereign AI — Local-First Intelligence
export { LifeContextService, type ContextEntry, type ContextType, type ContextQuery } from './lifeContext.service';
export { KnowledgeGraphService, type Entity, type Relationship, type EntityType } from './knowledgeGraph.service';
export { PredictiveService, type PredictedQuery, type QueryPattern } from './predictive.service';
export { SyncService, type SyncPackage } from './sync.service';
export { DeviceService } from './device.service';
export { AppLauncherService, type InstalledApp } from './applauncher.service';
export { FocusTimerService, FOCUS_DURATIONS, type FocusSession } from './focustimer.service';
export { HapticService } from './haptic.service';
export { WeatherService, type WeatherData } from './weather.service';
export { ContactsService, type PriorityContact } from './contacts.service';
export { SyncthingService, type SyncthingStatus, type LANServerStatus } from './syncthing.service';
export * from './HapticSymphony';

// Chrysalis V2 — Agent OS
export { OrchestratorService, type Tool, type ToolResult, type OrchestrationResult } from './orchestrator.service';
export { OllamaService } from './ollama.service';
export { registerDeviceTools, getRegisteredToolNames } from './device.tools';
export { A2ABridge, type DeviceIdentity, type RemoteDevice } from './a2a.bridge';
export { SearchService, type SearchResult, type SearchResponse } from './search.service';

// Passive Intelligence
export {
    PassiveIntelligenceService,
    ClipboardWatcher,
    NotificationInterceptor,
    ScreenContext,
    type ClipboardCapture,
    type NotificationData,
    type ScreenContext as ScreenContextType,
    type PassiveStatus,
} from './passive.service';

// SC1 Local Agent — Sovereign Intelligence Daemon
export {
    LocalAgentService,
    type AgentState,
    type HealthReport,
    type Alert,
    type AgentTask,
    type Trigger,
} from './localagent.service';

// Router Service — MCP Router Client
export { RouterService } from './router.service';

// Device Orchestrator — Ambient OS (Mode C)
export {
    DeviceOrchestratorService,
    type RunRecord,
    type DeviceCommand,
    type DeviceStatus,
    type SkillDef,
} from './device_orchestrator.service';

// Mobile Bus — Hub Communication
export {
    MobileBusService,
    type MobileState,
    type HubCommand,
    type BusState,
} from './bus.service';

// Session Continuity
export {
    SessionService,
    type SessionData,
    type SessionMetadata,
} from './session.service';

// Overlay Service — Floating Bubble
export {
    OverlayService,
    type OverlayQueryEvent,
    type OverlayQuickActionEvent,
} from './overlay.service';

// Natural Language Actions
export {
    IntentParser,
    type ParsedIntent,
    type IntentType,
    type IntentEntities,
} from './intent.parser';

export {
    ActionExecutor,
    type ActionResult,
    type ActionHandler,
} from './action.executor';

// Widget Service
export {
    WidgetService,
    type WidgetData,
} from './widget.service';

// Nudge Engine
export {
    NudgeService,
    type Nudge,
    type NudgeType,
    type NudgePriority,
    type NudgeAction,
    type NudgeConfig,
} from './nudge.service';

// Notification Filter — AI Classification
export {
    NotificationFilter,
    type NotificationCategory,
    type ClassifiedNotification,
    type FilterConfig,
} from './notification.filter';

// OCR Service — Screenshot Text Extraction
export {
    OCRService,
    type OCRResult,
    type OCRBlock,
    type OCRLine,
    type ScreenshotCapture,
    type ExtractedPatterns,
} from './ocr.service';

// Automation Service — Cross-App Actions
export {
    AutomationService,
    type ActionResult as AutomationResult,
    type ClickableElement,
    type ScrollDirection,
} from './automation.service';

// Geofence Service — Location Triggers
export {
    GeofenceService,
    type GeofenceLocation,
    type GeofenceOptions,
    type GeofenceAction,
    type GeofenceEvent,
    type LocationPermissionStatus,
} from './geofence.service';

// Briefing Service — Morning/Evening Rituals
export {
    BriefingService,
    type BriefingType,
    type Briefing,
    type BriefingSection,
    type BriefingItem,
    type BriefingAction,
    type DaySummary,
} from './briefing.service';

// Focus Service — Deep Work & Auto-Responder
export {
    FocusService,
    type FocusStatus,
    type FocusPreset,
    type FocusOptions,
    type FocusEvent,
} from './focus.service';

// Pattern Service — Behavior Pattern Recognition
export {
    PatternService,
    type Pattern,
    type PatternType,
    type PatternContext,
    type PatternSuggestion,
} from './pattern.service';

// Behavior Tracker — Event Collection
export {
    BehaviorTracker,
    type TrackedEvent,
    type EventCategory,
} from './behavior.tracker';

// Relationship Service — Communication Tracking
export {
    RelationshipService,
    type RelationshipRecord,
    type RelationshipInsight,
    type CommunicationEvent,
} from './relationship.service';

// Digest Service — Weekly Summaries
export {
    DigestService,
    type WeeklyDigest,
    type DigestSection,
    type DigestMetric,
    type DigestItem,
    type WeeklyStats,
} from './digest.service';

// Gesture Service — Shake Detection
export {
    GestureService,
    type GestureEvent,
} from './gesture.service';

// Mesh Service — Agent Communication Network
export {
    MeshService,
    type MeshAgent,
    type ChatMessage,
    type TaskMessage,
    type TaskResultMessage,
    type PresenceMessage,
    type MeshMessage,
} from './mesh.service';
