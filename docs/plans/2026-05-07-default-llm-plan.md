# Default LLM Provider Configuration Implementation Plan

## Goal
Set up a default LLM Provider configuration in the backend via `.env` that is used when the user has not provided their own. Protect the default credentials from being exposed to the frontend, and show a disclaimer in the Settings UI.

## Proposed Changes

### Backend Updates
#### [MODIFY] [backend/core/config.py](file:///home/dino/Documents/laidocs/backend/core/config.py)
- Add `default_llm_base_url`, `default_llm_api_key`, `default_llm_model` to the `Settings` class.
- Add an `@property def active_llm(self) -> LLMConfig` that returns the user's `self.llm` merged with the default fallback credentials if the user's fields are empty.

#### [MODIFY] [backend/api/settings.py](file:///home/dino/Documents/laidocs/backend/api/settings.py)
- Ensure `read_settings` continues to return only `s.llm` (the user's overrides) so the default credentials are not leaked.
- Update `test_llm` to use `s.active_llm` so users can still test the default connection if they haven't entered anything.

#### [MODIFY] Multiple Services
- `backend/services/agent.py`
- `backend/services/rag.py`
- `backend/services/converter.py`
- `backend/api/chat.py`
- Change all references from `settings.llm` to `settings.active_llm` so the entire backend correctly routes requests using the default credentials if needed.

#### [MODIFY] [backend/.env.example](file:///home/dino/Documents/laidocs/backend/.env.example)
- Document the new `DEFAULT_LLM_...` variables.

### Frontend Updates
#### [MODIFY] [src/pages/Settings.tsx](file:///home/dino/Documents/laidocs/src/pages/Settings.tsx)
- Insert the requested notice into the LLM `ServiceSection`: *"Server LLM đang được serve mặc định bởi bộ phận L.AI P, nếu muốn setup model riêng nhanh và mạnh hơn vui lòng setup ở đây"*.

## User Review Required
The proposed changes safely isolate the default credentials in the backend environment. Do you agree with this approach?
