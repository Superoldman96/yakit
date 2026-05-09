import type { AIAgentGrpcApi } from '@/pages/ai-re-act/hooks/grpcApi'
import { yakitFailed } from '@/utils/notification'

export type WebFuzzerApplyRequestExtras = { isHttps?: boolean }

const pageApplyHandlers = new Map<string, (raw: string, extras?: WebFuzzerApplyRequestExtras) => void>()
const pageGetRequestHandlers = new Map<string, () => string>()
const lastAppliedReplaceRequestByPage = new Map<string, { raw: string; isHttps: boolean | undefined }>()

/** Web Fuzzer 页内联审阅：问答开始前快照 vs AI `replace`（由 `HTTPFuzzerPageCore` 注册） */
export type WebFuzzerCasualReplaceReviewPayload = {
  original: string
  change: AIAgentGrpcApi.HttpFuzzRequestChange
}

type WebFuzzerCasualReplaceReviewHandler = (payload: WebFuzzerCasualReplaceReviewPayload) => void

const pageCasualReplaceReviewHandlers = new Map<string, WebFuzzerCasualReplaceReviewHandler>()

export function registerWebFuzzerPageCasualReplaceReview(
  pageId: string,
  handler: WebFuzzerCasualReplaceReviewHandler,
): () => void {
  pageCasualReplaceReviewHandlers.set(pageId, handler)
  return () => {
    if (pageCasualReplaceReviewHandlers.get(pageId) === handler) {
      pageCasualReplaceReviewHandlers.delete(pageId)
    }
  }
}

/** 将 `replace` 交给 Web Fuzzer 页展示审阅（同一会话内多次推送时由页内合并为「快照 vs 最新 raw」单条） */
export function enqueueWebFuzzerCasualReplaceReview(
  pageId: string,
  payload: WebFuzzerCasualReplaceReviewPayload,
): void {
  const fn = pageCasualReplaceReviewHandlers.get(pageId)
  if (fn) fn(payload)
}

/**
 * 由 `HTTPFuzzerPageCore` 在挂载时注册，用于从 AI 代码卡「应用」将请求原文写入当前页并同步会话存储。
 */
export function registerWebFuzzerPageApplyRequestFromCard(
  pageId: string,
  handler: (raw: string, extras?: WebFuzzerApplyRequestExtras) => void,
): () => void {
  pageApplyHandlers.set(pageId, handler)
  return () => {
    if (pageApplyHandlers.get(pageId) === handler) {
      pageApplyHandlers.delete(pageId)
      lastAppliedReplaceRequestByPage.delete(pageId)
    }
  }
}

/**
 * 由 `HTTPFuzzerPageCore` 注册，供「对比」等能力读取当前页 `requestRef` 中的请求原文（与 Monaco 侧一致）。
 */
export function registerWebFuzzerPageGetRequestString(pageId: string, getRequest: () => string): () => void {
  pageGetRequestHandlers.set(pageId, getRequest)
  return () => {
    if (pageGetRequestHandlers.get(pageId) === getRequest) {
      pageGetRequestHandlers.delete(pageId)
    }
  }
}

/** 读取当前 Web Fuzzer 页签请求盒中的内容；未注册时返回 `null` */
export function getWebFuzzerPageRequestString(pageId: string): string | null {
  const fn = pageGetRequestHandlers.get(pageId)
  if (!fn) return null
  return fn()
}

/** 从 Web Fuzzer AI 代码卡将内容应用到指定页签的请求编辑器（会触发 `onSetRequest` 的会话落盘与编辑器刷新） */
export function applyRequestContentToWebFuzzerPage(pageId: string, raw: string): void {
  const fn = pageApplyHandlers.get(pageId)
  if (!fn) {
    yakitFailed('未找到对应的 Web Fuzzer 页，请保持该页已打开。')
    return
  }
  fn(raw)
}

/**
 * 由引擎 `http_fuzz_request_change` 推送：按 `op` 写入 Web Fuzzer。
 * 当前仅处理 `replace`；其它 `op` 在 `switch` 的 `default` 中预留扩展。
 */
export type ApplyHttpFuzzRequestChangeOptions = {
  /** 为 true 时跳过「与上次 replace 完全相同则忽略」；用于 casual 分段保留等仍须触发写回/刷新的场景 */
  skipReplaceDedup?: boolean
}

export function applyHttpFuzzRequestChangeToWebFuzzerPage(
  pageId: string,
  data: AIAgentGrpcApi.HttpFuzzRequestChange,
  options?: ApplyHttpFuzzRequestChangeOptions,
): void {
  const op = data?.op

  switch (op) {
    case 'replace': {
      const fn = pageApplyHandlers.get(pageId)
      if (!fn) {
        yakitFailed('未找到对应的 Web Fuzzer 页，请保持该页已打开。')
        return
      }
      const raw = data?.request?.raw
      if (raw == null || String(raw).trim() === '') return
      const normalizedRaw = String(raw)
      const isHttps = data.request.is_https
      const lastApplied = lastAppliedReplaceRequestByPage.get(pageId)
      if (
        !options?.skipReplaceDedup &&
        lastApplied &&
        lastApplied.raw === normalizedRaw &&
        lastApplied.isHttps === isHttps
      ) {
        return
      }

      lastAppliedReplaceRequestByPage.set(pageId, {
        raw: normalizedRaw,
        isHttps,
      })
      fn(normalizedRaw, { isHttps })
      return
    }
    default:
      // 预留：非 `replace` 的 `op`（如 patch、merge 等）在此分支自行扩展；
      // 需要写请求盒时可复用 `pageApplyHandlers.get(pageId)` 或抽新函数。
      break
  }
}

export { WebFuzzerAiRequestCompareModalContent } from './webFuzzerAiRequestCompareModalContent'
export type { WebFuzzerAiRequestCompareModalContentProps } from './webFuzzerAiRequestCompareModalContent'
