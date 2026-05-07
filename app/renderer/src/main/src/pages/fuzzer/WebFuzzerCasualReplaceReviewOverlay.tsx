import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useMemoizedFn } from 'ahooks'

import type { WebFuzzerCasualReplaceReviewPayload } from '@/pages/fuzzer/webFuzzerAiRequestApplyBridge'
import { YakitMonacoDiffInline } from '@/components/yakitUI/YakitMonacoDiffInline/YakitMonacoDiffInline'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { computeCasualLineHunks, mergeCasualLineHunks } from '@/pages/fuzzer/webFuzzerCasualLineMerge'

import styles from './WebFuzzerCasualReplaceReviewOverlay.module.scss'

function norm(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export interface WebFuzzerCasualReplaceReviewOverlayProps {
  /** 同一次 casual 会话内稳定，用于 Monaco 实例与防重复自动应用 */
  roundKey: string
  payload: WebFuzzerCasualReplaceReviewPayload
  onApplyRound: (mergedRaw: string, done?: boolean) => void
}

const WebFuzzerCasualReplaceReviewOverlay = memo(function WebFuzzerCasualReplaceReviewOverlayInner(
  props: WebFuzzerCasualReplaceReviewOverlayProps,
) {
  const { roundKey, payload, onApplyRound } = props
  const { t } = useI18nNamespaces(['webFuzzer'])
  /** casual 开始时快照（会话级不变） */
  const sessionSnapshot = payload.original
  const incoming = payload.change.request?.raw ?? ''

  /** Diff 左侧：已「保留」片段与未处理部分合成；流式更新右侧时不清空，避免丢进度 */
  const [reviewBaseline, setReviewBaseline] = useState(sessionSnapshot)
  /** 右侧提案：流式/新 raw 同步；「撤销」某块时裁切 */
  const [draftIncoming, setDraftIncoming] = useState(incoming)
  /** 与 `diff` 行级块一致，避免 Monaco getLineChanges 拆块导致「保留 1/3」只合了一小段 */
  const hunks = useMemo(() => computeCasualLineHunks(reviewBaseline, draftIncoming), [reviewBaseline, draftIncoming])
  /** 左侧或右侧任一变化后递增，强制 Monaco 重挂 */
  const [diffNonce, setDiffNonce] = useState(0)
  const diffNonceRef = useRef(0)
  /** 无差异时避免重复触发 onApplyRound(done) */
  const autoDoneRef = useRef(false)
  const hunksRef = useRef(hunks)
  const reviewBaselineRef = useRef(reviewBaseline)
  const draftIncomingRef = useRef(draftIncoming)
  const prevIncomingRef = useRef<string | null>(null)

  const bumpDiffNonce = useMemoizedFn(() => {
    diffNonceRef.current += 1
    setDiffNonce(diffNonceRef.current)
  })

  hunksRef.current = hunks

  useEffect(() => {
    reviewBaselineRef.current = reviewBaseline
  }, [reviewBaseline])

  useEffect(() => {
    draftIncomingRef.current = draftIncoming
  }, [draftIncoming])

  useEffect(() => {
    autoDoneRef.current = false
    reviewBaselineRef.current = sessionSnapshot
    draftIncomingRef.current = incoming
    setReviewBaseline(sessionSnapshot)
    setDraftIncoming(incoming)
    bumpDiffNonce()
    prevIncomingRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, sessionSnapshot, bumpDiffNonce])

  useEffect(() => {
    if (prevIncomingRef.current === null) {
      prevIncomingRef.current = incoming
      return
    }
    if (prevIncomingRef.current === incoming) return
    prevIncomingRef.current = incoming
    draftIncomingRef.current = incoming
    bumpDiffNonce()
    setDraftIncoming(incoming)
  }, [incoming, bumpDiffNonce])

  useEffect(() => {
    if (hunks.length !== 0) {
      autoDoneRef.current = false
      return
    }
    if (norm(reviewBaseline) !== norm(draftIncoming)) return
    if (autoDoneRef.current) return
    autoDoneRef.current = true
    onApplyRound(reviewBaselineRef.current, true)
  }, [hunks, reviewBaseline, draftIncoming, onApplyRound])

  const setChangeDecision = useMemoizedFn((idx: number, v: 'accept' | 'reject') => {
    const hs = hunksRef.current
    if (!hs[idx]) return
    const rb = reviewBaselineRef.current
    const di = draftIncomingRef.current
    const decMap: Record<string, 'accept' | 'reject'> = {}
    hs.forEach((h, j) => {
      decMap[h.id] = j === idx ? v : v === 'accept' ? 'reject' : 'accept'
    })
    if (v === 'accept') {
      const merged = mergeCasualLineHunks(rb, hs, decMap)
      reviewBaselineRef.current = merged
      setReviewBaseline(merged)
      bumpDiffNonce()
      onApplyRound(merged, false)
      return
    }
    const nextDraft = mergeCasualLineHunks(rb, hs, decMap)
    draftIncomingRef.current = nextDraft
    setDraftIncoming(nextDraft)
    bumpDiffNonce()
  })

  const handleRejectAll = useMemoizedFn(() => {
    const rb = reviewBaselineRef.current
    draftIncomingRef.current = rb
    setDraftIncoming(rb)
    bumpDiffNonce()
    onApplyRound(rb, true)
  })

  const handleAcceptAll = useMemoizedFn(() => {
    const hs = hunksRef.current
    const rb = reviewBaselineRef.current
    const decMap: Record<string, 'accept' | 'reject'> = {}
    hs.forEach((h) => {
      decMap[h.id] = 'accept'
    })
    const merged = mergeCasualLineHunks(rb, hs, decMap)
    reviewBaselineRef.current = merged
    draftIncomingRef.current = merged
    setReviewBaseline(merged)
    setDraftIncoming(merged)
    bumpDiffNonce()
    onApplyRound(merged, true)
  })

  const acceptMetaPreview = useMemo(() => {
    const change = payload.change
    const req = change?.request ?? {}
    const { raw: _raw, ...requestRest } = req as Record<string, unknown>
    const preview = {
      ...change,
      request: requestRest,
    }
    return JSON.stringify(preview, null, 2)
  }, [payload.change])

  return (
    <div className={styles['overlay']} role="dialog" aria-modal="true">
      <div className={styles['diffWrap']}>
        <YakitMonacoDiffInline
          key={`${roundKey}:${diffNonce}:${draftIncoming}`}
          reuseKey={roundKey}
          original={reviewBaseline}
          incoming={draftIncoming}
          hunks={hunks}
          onDecision={setChangeDecision}
          language="http"
        />
      </div>
      {hunks.length > 0 && (
        <div className={styles['bulkBar']}>
          <button type="button" className={styles['bulkReject']} onClick={handleRejectAll}>
            {t('HTTPFuzzerPage.aiCasualRejectAll')}
          </button>
          <div className={styles['bulkAcceptWrap']}>
            <button type="button" className={styles['bulkAccept']} onClick={handleAcceptAll}>
              {t('HTTPFuzzerPage.aiCasualAcceptAll')}
            </button>
            <div className={styles['acceptMetaCard']}>
              <div className={styles['acceptMetaTitle']}>{t('HTTPFuzzerPage.aiCasualAcceptAllMetaTitle')}</div>
              <pre className={styles['acceptMetaPre']}>{acceptMetaPreview}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

WebFuzzerCasualReplaceReviewOverlay.displayName = 'WebFuzzerCasualReplaceReviewOverlay'

export { WebFuzzerCasualReplaceReviewOverlay }
