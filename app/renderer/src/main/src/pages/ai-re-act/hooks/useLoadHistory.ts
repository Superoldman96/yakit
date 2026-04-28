import { useMemoizedFn } from 'ahooks'
import { useEffect, useRef, useState } from 'react'
const PREPEND_OFFSET = 1000000

interface UseLoadHistoryProps {
  loading: boolean
  dataLength: number
  fetchHasMore: () => boolean
  loadMore: () => void
  SessionID: string
}
const useLoadHistory = ({ loading, dataLength, SessionID, fetchHasMore, loadMore }: UseLoadHistoryProps) => {
  const [firstItemIndex, setFirstItemIndex] = useState(PREPEND_OFFSET)
  const wasLoadingRef = useRef(false)
  const prevLengthRef = useRef(dataLength)
  const handleLoadMore = useMemoizedFn(() => {
    if (loading || !fetchHasMore() || !SessionID) return
    loadMore()
  })

  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      const diff = dataLength - prevLengthRef.current
      if (diff > 0) {
        setFirstItemIndex((prev) => Math.max(0, prev - diff))
      }
      prevLengthRef.current = dataLength
    }
    wasLoadingRef.current = loading
  }, [loading, dataLength])

  // 切换会话时重置，避免不同会话的索引互相干扰
  useEffect(() => {
    setFirstItemIndex(PREPEND_OFFSET)
    prevLengthRef.current = dataLength
    wasLoadingRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SessionID])
  return {
    firstItemIndex,
    handleLoadMore,
  }
}

export default useLoadHistory
