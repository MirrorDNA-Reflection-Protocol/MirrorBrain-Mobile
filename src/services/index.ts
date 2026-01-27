/**
 * Services Index
 */

export { VaultService, STORAGE_PATHS } from './vault.service';
export { IdentityService } from './identity.service';
export { LLMService, AVAILABLE_MODELS, type ModelId } from './llm.service';
export { CalendarService, type CalendarEvent } from './calendar.service';
export { VoiceService } from './voice.service';
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
export { registerDeviceTools, getRegisteredToolNames } from './device.tools';
export { A2ABridge, type DeviceIdentity, type RemoteDevice } from './a2a.bridge';
export { SearchService, type SearchResult, type SearchResponse } from './search.service';

