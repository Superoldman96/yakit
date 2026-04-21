import React, { useEffect, useRef, useState } from 'react'
import { AIToolPageItemProps, AIToolProps } from './AIToolType'
import { useCreation, useDebounceFn, useInViewport, useMemoizedFn } from 'ahooks'

import { HubGridList, HubGridOpt } from '../pluginHub/pluginHubList/funcTemplate'
import { YakitSpin } from '@/components/yakitUI/YakitSpin/YakitSpin'
import styles from './AITool.module.scss'
import { YakitEmpty } from '@/components/yakitUI/YakitEmpty/YakitEmpty'
import { useEmptyImage } from '@/hook/useResultEmpty/SearchEmpty'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { OutlinePlusIcon, OutlineRefreshIcon, OutlineSearchIcon, OutlineStarIcon } from '@/assets/icon/outline'
import emiter from '@/utils/eventBus/eventBus'
import { YakitRoute } from '@/enums/yakitRoute'
import { YakitInput } from '@/components/yakitUI/YakitInput/YakitInput'
import { TableTotalAndSelectNumber } from '@/components/TableTotalAndSelectNumber/TableTotalAndSelectNumber'
import { Divider } from 'antd'
import { GetAIToolListRequest, GetAIToolListResponse, ToggleAIToolFavoriteRequest } from '../ai-agent/type/aiTool'
import { genDefaultPagination } from '../invoker/schema'
import { grpcGetAIToolList, grpcToggleAIToolFavorite } from '../ai-agent/aiToolList/utils'
import { ToolQueryType } from '../ai-agent/aiToolList/AIToolListType'
import { YakitRadioButtons } from '@/components/yakitUI/YakitRadioButtons/YakitRadioButtons'
import { toolTypeOptions } from '../ai-agent/aiToolList/AIToolList'
import { SolidStarIcon } from '@/assets/icon/solid'
const AIToolPage: React.FC<AIToolProps> = React.memo((props) => {
  const [toolQueryType, setToolQueryType] = useState<ToolQueryType>('all')
  const emptyImageTarget = useEmptyImage('search')
  const [response, setResponse] = useState<GetAIToolListResponse>({
    Pagination: genDefaultPagination(20),
    Tools: [],
    Total: 0,
  })
  // 列表无条件下的总数
  const [listTotal, setListTotal] = useState<number>(0)

  // 搜索条件
  const [keyWord, setKeyWord] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  // 是否为获取列表第一页的加载状态
  const isInitLoading = useRef<boolean>(false)
  const hasMore = useRef<boolean>(true)

  const forgeRef = useRef<HTMLDivElement>(null)
  const [inViewPort = true] = useInViewport(forgeRef)
  useEffect(() => {
    if (inViewPort) {
      fetchData(true)
      fetchInitTotal()
    }
  }, [inViewPort])
  const fetchInitTotal = useMemoizedFn(() => {
    const request: GetAIToolListRequest = {
      Pagination: {
        ...response.Pagination,
        Page: 1,
        Limit: 1,
      },
      Query: keyWord,
      ToolName: '',
      OnlyFavorites: false,
    }
    grpcGetAIToolList(request, true)
      .then((res) => {
        setListTotal(Number(res.Total) || 0)
      })
      .catch(() => {})
  })
  // 刷新列表(是否刷新高级筛选数据)
  const handleRefreshList = useDebounceFn(
    useMemoizedFn(() => {
      fetchData(true)
    }),
    { wait: 200 },
  ).run
  // 获取 AI-Tool 列表
  const fetchData = useMemoizedFn(async (isInit?: boolean) => {
    if (loading) return
    if (isInit) {
      hasMore.current = true
      isInitLoading.current = true
    }
    setLoading(true)
    const pageInfo = response.Pagination
    const newQuery: GetAIToolListRequest = {
      Query: keyWord,
      ToolName: '',
      Pagination: {
        ...genDefaultPagination(20),
        Page: isInit ? 1 : ++pageInfo.Page,
      },
      OnlyFavorites: toolQueryType === 'collect',
    }
    try {
      const res = await grpcGetAIToolList(newQuery)
      if (!res.Tools) res.Tools = []
      const newPage = +res.Pagination.Page
      const length = newPage === 1 ? res.Tools.length : res.Tools.length + response.Tools.length
      hasMore.current = length < +res.Total
      let newRes: GetAIToolListResponse = {
        Tools: newPage === 1 ? res?.Tools : [...response.Tools, ...(res?.Tools || [])],
        Pagination: res?.Pagination || {
          ...genDefaultPagination(20),
        },
        Total: res.Total,
      }
      setResponse(newRes)
    } catch (error) {}
    setTimeout(() => {
      isInitLoading.current = false
      setLoading(false)
    }, 300)
  })
  const onUpdateList = useMemoizedFn(() => {
    fetchData()
  })
  const onNewForge = useMemoizedFn(() => {
    emiter.emit(
      'openPage',
      JSON.stringify({
        route: YakitRoute.AddAITool,
        params: {
          source: YakitRoute.AI_Tool,
        },
      }),
    )
  })
  const listLength = useCreation(() => {
    return Number(response.Total) || 0
  }, [response.Total])
  const onToolQueryTypeChange = useMemoizedFn((e) => {
    setToolQueryType(e.target.value as ToolQueryType)
    setKeyWord('')
    setTimeout(() => {
      fetchData(true)
    }, 200)
  })
  const onFavorite = useMemoizedFn((item) => {
    const params: ToggleAIToolFavoriteRequest = {
      ID: item.ID,
    }
    return grpcToggleAIToolFavorite(params).then(() => {
      setResponse((preV) => ({
        ...preV,
        Tools: preV.Tools.map((ele) => {
          if (ele.Name === item.Name) {
            return { ...ele, IsFavorite: !item.IsFavorite }
          }
          return ele
        }),
      }))
    })
  })
  console.log('response.Tools', response.Tools)
  return (
    <div className={styles['ai-tool']} ref={forgeRef}>
      <div className={styles['hub-list-header']}>
        <div className={styles['title']}>工具库</div>
        <div className={styles['extra']}>
          <YakitInput.Search
            prefix={<OutlineSearchIcon className={styles['search-icon']} />}
            allowClear
            placeholder="请输入关键词搜索"
            value={keyWord}
            onChange={(e) => setKeyWord(e.target.value)}
            size="large"
            wrapperClassName={styles['search-input']}
            onSearch={handleRefreshList}
          />
          <Divider type="vertical" className={styles['diver-style']} />

          <YakitButton size="large" icon={<OutlinePlusIcon />} onClick={onNewForge}>
            新建工具
          </YakitButton>
        </div>
      </div>

      <div className={styles['ai-tool-content']}>
        <div className={styles['hub-list-subTitle']}>
          <YakitRadioButtons
            buttonStyle="solid"
            value={toolQueryType}
            options={toolTypeOptions}
            onChange={onToolQueryTypeChange}
          />
          <TableTotalAndSelectNumber total={listLength} />
        </div>
        <div className={styles['hub-list-wrapper']}>
          <YakitSpin spinning={loading && isInitLoading.current}>
            {listLength > 0 ? (
              <HubGridList
                data={response.Tools || []}
                keyName="ID"
                loading={loading}
                hasMore={hasMore.current}
                updateList={onUpdateList}
                gridNode={(info) => {
                  const { index, data } = info
                  return <AIToolPageItem key={data.ID} index={index} data={data} onFavorite={onFavorite} />
                }}
              />
            ) : listTotal > 0 ? (
              <YakitEmpty
                image={emptyImageTarget}
                imageStyle={{ margin: '0 auto 24px', width: 274, height: 180 }}
                title="搜索结果“空”"
                className={styles['hub-list-empty']}
              />
            ) : (
              <div className={styles['hub-list-empty']}>
                <YakitEmpty title="暂无数据" description="可新建工具,创建属于自己的工具" />
                <div className={styles['refresh-buttons']}>
                  <YakitButton type="outline1" icon={<OutlinePlusIcon />} onClick={onNewForge}>
                    新建工具
                  </YakitButton>
                  <YakitButton type="outline1" icon={<OutlineRefreshIcon />} onClick={handleRefreshList}>
                    刷新
                  </YakitButton>
                </div>
              </div>
            )}
          </YakitSpin>
        </div>
      </div>
    </div>
  )
})

export default AIToolPage

const AIToolPageItem: React.FC<AIToolPageItemProps> = React.memo((props) => {
  const { index, data, onFavorite } = props
  const [favoriteLoading, setFavoriteLoading] = useState<boolean>(false)

  const handleFavorite = useMemoizedFn((e) => {
    e.stopPropagation()
    setFavoriteLoading(true)
    onFavorite(data).finally(() => {
      setTimeout(() => {
        setFavoriteLoading(false)
      }, 200)
    })
  })

  return (
    <HubGridOpt
      order={index}
      info={data}
      checked={false}
      onCheck={() => {}}
      title={data.VerboseName || data.Name}
      type={''}
      tags={data?.Keywords?.join(',')}
      help={data.Description || ''}
      img={''}
      user={''}
      time={data?.UpdatedAt || 0}
      isCorePlugin={true}
      official={true}
      isShowCheck={false}
      extraFooter={() => (
        <div className={styles['extra-footer']}>
          <YakitButton
            type="text2"
            loading={favoriteLoading}
            icon={
              data.IsFavorite ? (
                <SolidStarIcon className={styles['star-icon-active']} />
              ) : (
                <OutlineStarIcon className={styles['star-icon']} />
              )
            }
            onClick={handleFavorite}
          />
        </div>
      )}
    />
  )
})
