import { useCreation, useMemoizedFn } from 'ahooks'
import type {
  AIFileSystemPin,
  loadMoreType,
  UseHistoryChatEvents,
  UseHistoryChatParams,
  UseHistoryChatState,
} from './type'
import { grpcQueryAIEvent } from '@/pages/ai-agent/grpc'
import type { PaginationSchema } from '@/pages/invoker/schema'
import { yakitNotify } from '@/utils/notification'
import type { AIAgentGrpcApi, AIEventQueryRequest, AIOutputEvent } from './grpcApi'
import { Uint8ArrayToString } from '@/utils/str'
import { useRef, useState } from 'react'
import { AIChatQSDataTypeEnum, AIToolResult, type AIChatQSData, type AIChatQSDataType } from './aiRender'
import { genBaseAIChatData, isToolStderrStream, isToolStdoutStream } from './utils'
import { convertNodeIdToVerbose, DefaultAIToolResult } from './defaultConstant'
import cloneDeep from 'lodash/cloneDeep'

const DefaultHistoryPagination: PaginationSchema = { Page: 1, Limit: 200, OrderBy: 'created_at', Order: 'desc' }

function useHistoryChat(params?: UseHistoryChatParams): [UseHistoryChatState, UseHistoryChatEvents]

function useHistoryChat(params?: UseHistoryChatParams) {
  const {
    getChatDataStore,
    setTimelines,
    setGrpcFiles,
    setCasualElements,
    getCasualElements,
    setTaskElements,
    getTaskElements,
  } = params || {}

  // 更新当前session的历史数据请求基线(beforeID)
  const updateBeforeID = useMemoizedFn((type: loadMoreType, chatID: string) => {
    const dataStore = getChatDataStore?.()
    if (dataStore && dataStore.beforeID) {
      dataStore.beforeID[type] = chatID
    }
  })

  // #region 历史数据-时间线
  const [timelinesLoading, setTimelinesLoading] = useState(false)
  const hasMoreTimeline = useRef(true)
  const getTimelineBeforeID = useMemoizedFn(() => {
    return getChatDataStore?.()?.beforeID?.timelineID || undefined
  })
  const handleHistoryTimelines = useMemoizedFn(async (session: string) => {
    if (!hasMoreTimeline.current) return

    if (!session) {
      yakitNotify('error', '会话ID不存在，无法获取历史聊天记录')
      return
    }

    const request: AIEventQueryRequest = {
      Filter: { SessionID: session, NodeId: ['timeline_item'] },
      Pagination: { ...DefaultHistoryPagination },
    }
    if (getTimelineBeforeID()) {
      request.Pagination!.BeforeId = Number(getTimelineBeforeID())
    }
    setTimelinesLoading(true)
    try {
      const { Events, Total } = await grpcQueryAIEvent(request, true)
      if (Total === 0) {
        hasMoreTimeline.current = false
        return
      }

      updateBeforeID('timelineID', `${Events[Events.length - 1].ID}`)
      const timelineItems: AIAgentGrpcApi.TimelineItem[] = Events.map((item) => {
        let ipcContent = Uint8ArrayToString(item.Content) || ''
        return JSON.parse(ipcContent) as AIAgentGrpcApi.TimelineItem
      }).reverse()
      hasMoreTimeline.current = Events.length === request.Pagination?.Limit!
      setTimelines?.((old) => [...timelineItems, ...old])
    } catch {
    } finally {
      setTimeout(() => {
        setTimelinesLoading(false)
      }, 200)
    }
  })
  // #endregion

  // #region 历史数据-运行产生的文件记录
  const handleHistoryFileSystem = useMemoizedFn(async (session: string) => {
    if (!session) {
      yakitNotify('error', '会话ID不存在，无法获取历史聊天记录')
      return
    }

    const request: AIEventQueryRequest = {
      Filter: { SessionID: session, EventType: ['filesystem_pin_directory', 'filesystem_pin_filename'] },
      Pagination: { ...DefaultHistoryPagination, Limit: -1 },
    }
    try {
      const { Events, Total } = await grpcQueryAIEvent(request)
      if (Total === 0) return

      const files: AIFileSystemPin[] = Events.map((item) => {
        let ipcContent = Uint8ArrayToString(item.Content) || ''
        const { path } = JSON.parse(ipcContent) as AIAgentGrpcApi.FileSystemPin
        return { path, isFolder: item.Type === 'filesystem_pin_directory' }
      })
      // 去重
      const filterFiles: AIFileSystemPin[] = [...new Map(files.map((item) => [item.path, item])).values()]
      setGrpcFiles?.((old) => [...filterFiles, ...old])
    } catch {}
  })
  // #endregion

  // #region 历史数据-会话列表数据
  const getCasualContentMap = useMemoizedFn((mapKey: string) => {
    const contentMap = getChatDataStore?.()?.casualChat?.contents
    if (!contentMap) return undefined
    return contentMap.get(mapKey)
  })
  const setCasualContentMap = useMemoizedFn((mapKey: string, value: AIChatQSData) => {
    const contentMap = getChatDataStore?.()?.casualChat?.contents
    contentMap && contentMap.set(mapKey, value)
  })

  const getTaskContentMap = useMemoizedFn((mapKey: string) => {
    const contentMap = getChatDataStore?.()?.taskChat?.contents
    if (!contentMap) return undefined
    return contentMap.get(mapKey)
  })
  const setTaskContentMap = useMemoizedFn((mapKey: string, value: AIChatQSData) => {
    const contentMap = getChatDataStore?.()?.taskChat?.contents
    contentMap && contentMap.set(mapKey, value)
  })

  const updateCasualElement = useMemoizedFn(
    (main: { mapKey: string; type: AIChatQSDataType }, sub?: { mapKey: string; type: AIChatQSDataType }) => {
      if (!getCasualElements || !setCasualElements) return
      // 先判断该项是否存在
      const target = getCasualElements().findIndex(
        (item) => item.token === main.mapKey && item.type === main.type && (sub ? item.isGroup : true),
      )
      try {
        if (target >= 0) {
          const newArr = [...getCasualElements()]

          const item = newArr[target]
          const newItem = { ...item, renderNum: item.renderNum + 1 }
          newArr[target] = newItem

          if (!sub || !newItem.isGroup) {
            setCasualElements(newArr)
            return newArr
          }
          const newChildren = [...newItem.children]
          const subIndex = newChildren.findIndex((item) => item.token === sub.mapKey && item.type === sub.type)
          if (subIndex >= 0) {
            newChildren[subIndex] = {
              ...newChildren[subIndex],
              renderNum: newChildren[subIndex].renderNum + 1,
            }
          } else {
            newChildren.push({
              chatType: 'reAct',
              token: sub.mapKey,
              type: sub.type,
              renderNum: 1,
            })
          }
          newItem.children = newChildren
          setCasualElements(newArr)
        } else {
          if (sub) {
            setCasualElements((old) =>
              old.concat([
                {
                  chatType: 'reAct',
                  token: main.mapKey,
                  type: main.type,
                  renderNum: 1,
                  isGroup: true,
                  children: [{ chatType: 'reAct', token: sub.mapKey, type: sub.type, renderNum: 1 }],
                },
              ]),
            )
          } else {
            setCasualElements((old) =>
              old.concat([{ chatType: 'reAct', token: main.mapKey, type: main.type, renderNum: 1 }]),
            )
          }
        }
      } catch (error) {}
    },
  )
  const updateTaskElement = useMemoizedFn(
    (main: { mapKey: string; type: AIChatQSDataType }, sub?: { mapKey: string; type: AIChatQSDataType }) => {
      if (!getTaskElements || !setTaskElements) return
      // 先判断该项是否存在
      const target = getTaskElements().findIndex(
        (item) => item.token === main.mapKey && item.type === main.type && (sub ? item.isGroup : true),
      )
      try {
        if (target >= 0) {
          const newArr = [...getTaskElements()]

          const item = newArr[target]
          const newItem = { ...item, renderNum: item.renderNum + 1 }
          newArr[target] = newItem

          if (!sub || !newItem.isGroup) {
            setTaskElements(newArr)
            return newArr
          }
          const newChildren = [...newItem.children]
          const subIndex = newChildren.findIndex((item) => item.token === sub.mapKey && item.type === sub.type)
          if (subIndex >= 0) {
            newChildren[subIndex] = {
              ...newChildren[subIndex],
              renderNum: newChildren[subIndex].renderNum + 1,
            }
          } else {
            newChildren.push({
              chatType: 'task',
              token: sub.mapKey,
              type: sub.type,
              renderNum: 1,
            })
          }
          newItem.children = newChildren
          setTaskElements(newArr)
        } else {
          if (sub) {
            setTaskElements((old) =>
              old.concat([
                {
                  chatType: 'task',
                  token: main.mapKey,
                  type: main.type,
                  renderNum: 1,
                  isGroup: true,
                  children: [{ chatType: 'task', token: sub.mapKey, type: sub.type, renderNum: 1 }],
                },
              ]),
            )
          } else {
            setTaskElements((old) =>
              old.concat([{ chatType: 'task', token: main.mapKey, type: main.type, renderNum: 1 }]),
            )
          }
        }
      } catch (error) {}
    },
  )

  const [chatsLoading, setChatsLoading] = useState(false)
  const hasMoreChats = useRef(true)
  // 无法解析的接口数据
  const unParseChatData = useRef<AIOutputEvent[]>([])

  const getChatBeforeID = useMemoizedFn(() => {
    return getChatDataStore?.()?.beforeID?.chatID || undefined
  })

  /**
   * - 存放 Type:stream NodeId:tool-xxx-stderr 的内容数据
   * - call_tool_id => {content:string uuid:string status:"start" | "end"}
   * - 当stream-finished触发后，将内容全部设置到工具结果对象中的execError字段中
   * - 本NodeId和stream类型中的其他NodeId有一样的后端逻辑，但是前端需要将其区分出来
   */
  const streamToToolResultError = useRef<Map<string, { content: string; uuid: string; status: 'start' | 'end' }>>(
    new Map(),
  )

  // 解析数据方法
  const handleChatData = useMemoizedFn((res: AIOutputEvent[]) => {
    let chats: AIOutputEvent[] = unParseChatData.current || []
    unParseChatData.current = []
    chats = res.reverse().concat(chats)

    for (let item of chats) {
      try {
        let ipcContent = Uint8ArrayToString(item.Content) || ''
        console.log('历史聊天记录数据-单条', item, ipcContent)

        if (item.Type === 'thought') {
          const { thought } = (JSON.parse(ipcContent) as AIAgentGrpcApi.AIChatThought) || {}

          const chatData: AIChatQSData = {
            ...genBaseAIChatData(item),
            chatType: 'reAct',
            type: AIChatQSDataTypeEnum.THOUGHT,
            data: thought || '',
          }
          setCasualContentMap(chatData.id, chatData)
          updateCasualElement({ mapKey: chatData.id, type: chatData.type })
          continue
        }
        if (item.Type === 'result') {
          const { result, after_stream } = (JSON.parse(ipcContent) as AIAgentGrpcApi.AIChatResult) || {}
          if (!!after_stream) return

          const chatData: AIChatQSData = {
            ...genBaseAIChatData(item),
            chatType: 'reAct',
            type: AIChatQSDataTypeEnum.THOUGHT,
            data: result || '',
          }
          setCasualContentMap(chatData.id, chatData)
          updateCasualElement({ mapKey: chatData.id, type: chatData.type })
          continue
        }
        if (item.Type === 'fail_react_task') {
          const chatData: AIChatQSData = {
            ...genBaseAIChatData(item),
            chatType: 'reAct',
            type: AIChatQSDataTypeEnum.FAIL_REACT,
            data: {
              content: ipcContent,
              NodeId: item.NodeId,
              NodeIdVerbose: item.NodeIdVerbose || convertNodeIdToVerbose(item.NodeId),
            },
          }
          setCasualContentMap(chatData.id, chatData)
          updateCasualElement({ mapKey: chatData.id, type: chatData.type })
          return
        }

        if (item.Type === 'tool_call_start') {
          const { call_tool_id, tool, start_time, start_time_ms } = JSON.parse(ipcContent) as AIAgentGrpcApi.AIToolCall
          if (!call_tool_id) continue

          const toolResult: AIToolResult = {
            ...cloneDeep(DefaultAIToolResult),
            TaskIndex: item.TaskIndex || undefined,
            callToolId: call_tool_id,
            toolName: tool?.name || '-',
            toolDescription: tool?.description || '',
            startTime: start_time || 0,
            startTimeMS: start_time_ms || 0,
          }

          setCasualContentMap(call_tool_id, {
            ...genBaseAIChatData(item),
            id: call_tool_id,
            chatType: 'reAct',
            type: AIChatQSDataTypeEnum.TOOL_RESULT,
            data: toolResult,
          })
          continue
        }
        if (item.Type === 'tool_call_param') {
          const { call_tool_id, params } = JSON.parse(ipcContent) as AIAgentGrpcApi.AIToolCallParams
          if (!call_tool_id) continue

          const toolResult = getCasualContentMap(call_tool_id)
          if (!toolResult || toolResult.type !== AIChatQSDataTypeEnum.TOOL_RESULT) {
            unParseChatData.current.push(item)
            continue
          }

          toolResult.data.tool.reviewParams = cloneDeep(params)

          if (toolResult.data.type === 'result') {
            updateCasualElement({ mapKey: toolResult.id, type: toolResult.type })
          }
          continue
        }
        if (item.Type === 'stream_start') {
          // 属于日志数据的不进入UI展示
          if (item.IsSystem || item.IsReason) continue

          const { CallToolID, NodeId } = item
          if (!NodeId) continue

          const ipcContent = Uint8ArrayToString(item.Content) || ''
          const { event_writer_id } = JSON.parse(ipcContent) as { event_writer_id: string }
          // event_writer_id为空
          if (!event_writer_id) continue

          // tool-xxx-stdout 数据单独初始化逻辑
          if (isToolStdoutStream(NodeId) && !!CallToolID) {
            let toolResult = getCasualContentMap(CallToolID)
            if (!toolResult || toolResult.type !== AIChatQSDataTypeEnum.TOOL_RESULT) {
              unParseChatData.current.push(item)
              continue
            }

            // 这里是直接使用引用设置的值，所以不需要在使用setContentMap设置回去
            toolResult.data.stream.EventUUID = event_writer_id
            toolResult.data.type = 'stream'
            setCasualContentMap(event_writer_id, {
              ...genBaseAIChatData(item),
              id: event_writer_id,
              chatType: 'reAct',
              type: AIChatQSDataTypeEnum.STREAM,
              data: {
                NodeId,
                NodeIdVerbose: item.NodeIdVerbose || convertNodeIdToVerbose(NodeId),
                TaskIndex: item.TaskIndex || undefined,
                CallToolID,
                EventUUID: event_writer_id,
                status: 'start',
                content: '',
                ContentType: item.ContentType,
              },
            })
            continue
          }
          // tool-xxx-stderr 数据单独初始化逻辑
          if (isToolStderrStream(NodeId) && !!CallToolID) {
            if (!streamToToolResultError.current.has(CallToolID)) {
              streamToToolResultError.current.set(CallToolID, {
                content: '',
                uuid: event_writer_id,
                status: 'start',
              })
            }
            continue
          }

          // 数据集合中对应的数据
          const streamData = getCasualContentMap(event_writer_id)

          // 数据已存在，流数据输出顺序不对, 视为异常
          if (!!streamData) continue

          setCasualContentMap(event_writer_id, {
            ...genBaseAIChatData(item),
            id: event_writer_id,
            chatType: 'reAct',
            type: AIChatQSDataTypeEnum.STREAM,
            data: {
              NodeId,
              NodeIdVerbose: item.NodeIdVerbose || convertNodeIdToVerbose(NodeId),
              TaskIndex: item.TaskIndex || undefined,
              CallToolID,
              EventUUID: event_writer_id,
              status: 'start',
              content: '',
              ContentType: item.ContentType,
            },
          })
          continue
        }
      } catch (error) {}
    }
  })

  const handleHistoryChats = useMemoizedFn(async (session: string) => {
    if (!hasMoreChats.current) return

    if (!session) {
      yakitNotify('error', '会话ID不存在，无法获取历史聊天记录')
      return
    }

    const request: AIEventQueryRequest = {
      Filter: {
        SessionID: session,
        // EventType: [
        //   'stream',
        //   'plan_review_require',
        //   'task_review_require',
        //   'tool_use_review_require',
        //   'require_user_interactive',
        //   'exec_aiforge_review_require',
        //   'review_release',
        //   'ai_review_start',
        //   'ai_review_countdown',
        //   'ai_review_end',
        //   'thought',
        //   'result',
        //   'fail_react_task',
        //   'stream_start',
        //   'tool_call_start',
        //   'tool_call_param',
        //   'tool_call_watcher',
        //   'tool_call_log_dir',
        //   'tool_call_user_cancel',
        //   'tool_call_done',
        //   'tool_call_error',
        //   'tool_call_summary',
        //   'tool_call_decision',
        //   'fail_plan_and_execution',
        //   'reference_material',
        // ],
        // NodeId: ['react_task_dequeue', 'stream-finished', 'push_task', 'pop_task'],
      },
      Pagination: { ...DefaultHistoryPagination },
    }
    if (getChatBeforeID()) {
      request.Pagination!.BeforeId = Number(getChatBeforeID())
    }
    try {
      const { Events, Total } = await grpcQueryAIEvent(request)
      if (Total === 0) {
        hasMoreChats.current = false
        return
      }
      console.log('历史聊天记录数据', request, Events, Total)

      updateBeforeID('chatID', `${Events[Events.length - 1].ID}`)
    } catch {}
  })
  // #endregion

  // 重置状态
  const handleReset = useMemoizedFn(() => {
    hasMoreTimeline.current = true
    setTimelinesLoading(false)
    hasMoreChats.current = true
    unParseChatData.current = []
    setChatsLoading(false)
  })

  // 是否还有更多数据可供加载
  const fetchHasMore = useMemoizedFn((type: loadMoreType) => {
    switch (type) {
      case 'timelineID':
        return hasMoreTimeline.current
      case 'chatID':
        return hasMoreChats.current
      default:
        return false
    }
  })

  const [initLoading, setInitLoading] = useState(false)
  // 初始化加载
  const handleHistoryInit = useMemoizedFn((session: string) => {
    handleReset()
    setInitLoading(true)
    Promise.allSettled([
      handleHistoryTimelines(session),
      handleHistoryFileSystem(session),
      // handleHistoryChats(session)
    ]).finally(() => {
      setTimeout(() => {
        setInitLoading(false)
      }, 200)
    })
  })

  const handleLoadMore = useMemoizedFn((type: loadMoreType, session: string) => {
    if (!session) {
      yakitNotify('error', '会话ID不存在，无法获取历史聊天记录')
      return
    }
    switch (type) {
      case 'timelineID':
        handleHistoryTimelines(session)
        break
      case 'chatID':
        handleHistoryChats(session)
        break

      default:
        break
    }
  })

  const state: UseHistoryChatState = useCreation(() => {
    return { initLoading: initLoading, timelinesLoading: timelinesLoading, chatsLoading: chatsLoading }
  }, [initLoading, timelinesLoading, chatsLoading])

  const events: UseHistoryChatEvents = useCreation(() => {
    return { fetchHasMore, loadInit: handleHistoryInit, loadMore: handleLoadMore }
  }, [])

  return [state, events] as const
}

export default useHistoryChat
