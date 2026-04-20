import React, { useEffect, useRef, useState } from 'react'
import { AIForgeProps } from './AIForgeType'
import { useCreation, useDebounceFn, useInViewport, useMemoizedFn, useSelections } from 'ahooks'
import { AIForge, QueryAIForgeRequest, QueryAIForgeResponse } from '../ai-agent/type/forge'
import { AIForgeListDefaultPagination } from '../ai-agent/defaultConstant'
import { grpcQueryAIForge } from '../ai-agent/grpc'
import { HubGridList, HubGridOpt } from '../pluginHub/pluginHubList/funcTemplate'
import { YakitSpin } from '@/components/yakitUI/YakitSpin/YakitSpin'
import styles from './AIForge.module.scss'
import { YakitEmpty } from '@/components/yakitUI/YakitEmpty/YakitEmpty'
import { useEmptyImage } from '@/hook/useResultEmpty/SearchEmpty'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import {
  OutlineExportIcon,
  OutlineImportIcon,
  OutlinePlusIcon,
  OutlineRefreshIcon,
  OutlineSearchIcon,
} from '@/assets/icon/outline'
import emiter from '@/utils/eventBus/eventBus'
import { YakitRoute } from '@/enums/yakitRoute'
import { YakitInput } from '@/components/yakitUI/YakitInput/YakitInput'
import { TableTotalAndSelectNumber } from '@/components/TableTotalAndSelectNumber/TableTotalAndSelectNumber'
import { Divider } from 'antd'
import { BatchExportAIforgeRef, ExportAIForgeRequest, ImportAIforgeRef } from '../ai-agent/forgeName/type'
import { BatchExportAIforge, ImportAIforge } from '../ai-agent/forgeName/ForgeName'
import { YakitCheckbox } from '@/components/yakitUI/YakitCheckbox/YakitCheckbox'
const AIForgePage: React.FC<AIForgeProps> = React.memo((props) => {
  const emptyImageTarget = useEmptyImage('search')
  const [response, setResponse] = useState<QueryAIForgeResponse>({
    Pagination: { ...AIForgeListDefaultPagination },
    Data: [],
    Total: 0,
  })
  // 列表无条件下的总数
  const [listTotal, setListTotal] = useState<number>(0)

  // 搜索条件
  const [search, setSearch] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const batchExportRef = useRef<BatchExportAIforgeRef>(null)
  const importRef = useRef<ImportAIforgeRef>(null)

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
    const request: QueryAIForgeRequest = {
      Pagination: {
        ...response.Pagination,
        Page: 1,
        Limit: 1,
      },
    }
    grpcQueryAIForge(request, true)
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
  const handleEmiterTriggerRefresh = useDebounceFn(
    () => {
      fetchInitTotal()
      fetchData(true)
    },
    { wait: 300 },
  ).run
  // 获取 AI-Forge 列表
  const fetchData = useMemoizedFn((isInit?: boolean) => {
    if (loading) return
    if (isInit) {
      unSelectAll()
      hasMore.current = true
      isInitLoading.current = true
    }
    const pageInfo = response.Pagination
    const request: QueryAIForgeRequest = {
      Pagination: {
        ...pageInfo,
        Page: isInit ? 1 : ++pageInfo.Page,
      },
    }
    if (search) request.Filter = { Keyword: search }

    setLoading(true)
    grpcQueryAIForge(request)
      .then((res) => {
        const newLength = res.Data?.length || 0
        if (newLength < request.Pagination.Limit) hasMore.current = false
        else hasMore.current = true

        const newArr = isInit ? res.Data : response.Data.concat(res.Data)
        setResponse({ ...res, Pagination: request.Pagination, Data: newArr })
      })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => {
          isInitLoading.current = false
          setLoading(false)
        }, 300)
      })
  })
  const onUpdateList = useMemoizedFn(() => {
    fetchData()
  })
  const onNewForge = useMemoizedFn(() => {
    emiter.emit('menuOpenPage', JSON.stringify({ route: YakitRoute.AddAIForge }))
  })
  const listLength = useCreation(() => {
    return Number(response.Total) || 0
  }, [response.Total])

  const { selected, allSelected, isSelected, toggle, toggleAll, unSelectAll, partiallySelected } = useSelections(
    response.Data,
  )
  const selectedLength = useCreation(() => {
    return selected.length
  }, [selected.length])
  const onBatchExport = useMemoizedFn(() => {
    const query: ExportAIForgeRequest = {
      ForgeNames: [],
      OutputName: '',
      Filter: {
        Keyword: '',
      },
    }
    if (allSelected) {
      query.Filter = {
        Keyword: search,
      }
    } else {
      query.ForgeNames = selected.map((item) => item.ForgeName)
    }
    batchExportRef.current?.open(query)
  })
  const onExport = useMemoizedFn((data: AIForge) => {
    const tools = !!data?.ToolNames?.length ? data.ToolNames.filter(Boolean) : []
    batchExportRef.current?.open({
      ForgeNames: [data.ForgeName],
      ToolNames: tools,
      OutputName: data.ForgeVerboseName || data.ForgeName || '',
    })
  })
  const onImport = useMemoizedFn(() => {
    importRef.current?.open()
  })
  /** 单项勾选 */
  const optCheck = useMemoizedFn((data: AIForge) => {
    toggle(data)
  })
  console.log('selectedLength', selectedLength)
  return (
    <div className={styles['ai-forge']} ref={forgeRef}>
      <div className={styles['hub-list-header']}>
        <div className={styles['title']}>技能库</div>
        <div className={styles['extra']}>
          <YakitInput.Search
            prefix={<OutlineSearchIcon className={styles['search-icon']} />}
            allowClear
            placeholder="请输入关键词搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="large"
            wrapperClassName={styles['search-input']}
            onSearch={handleRefreshList}
          />
          <Divider type="vertical" className={styles['diver-style']} />
          <YakitButton
            disabled={!selectedLength}
            type="outline2"
            size="large"
            icon={<OutlineExportIcon />}
            onClick={onBatchExport}
          >
            批量导出
          </YakitButton>
          <YakitButton type="outline2" size="large" icon={<OutlineImportIcon />} onClick={onImport}>
            导入
          </YakitButton>
          <YakitButton size="large" icon={<OutlinePlusIcon />} onClick={onNewForge}>
            新建技能
          </YakitButton>
        </div>
      </div>

      <div className={styles['ai-forge-content']}>
        <div className={styles['hub-list-subTitle']}>
          <div className={styles['select-all']}>
            <YakitCheckbox checked={allSelected} onChange={() => toggleAll()} indeterminate={partiallySelected} />
            <span>全选</span>
          </div>
          <TableTotalAndSelectNumber total={listLength} selectNum={selectedLength} />
        </div>
        <div className={styles['hub-list-wrapper']}>
          <YakitSpin spinning={loading && isInitLoading.current}>
            {listLength > 0 ? (
              <HubGridList
                data={response.Data || []}
                keyName="Id"
                loading={loading}
                hasMore={hasMore.current}
                updateList={onUpdateList}
                gridNode={(info) => {
                  const { index, data } = info
                  const check = isSelected(data)
                  return (
                    <HubGridOpt
                      order={index}
                      info={data}
                      checked={check}
                      onCheck={optCheck}
                      title={data.ForgeVerboseName || data.ForgeName}
                      type={data.ForgeType}
                      tags={data.Tag?.join(',') || ''}
                      help={data.Description || ''}
                      img={''}
                      user={''}
                      time={data?.UpdatedAt || 0}
                      isCorePlugin={true}
                      official={true}
                      extraFooter={() => (
                        <div className={styles['extra-footer']}>
                          <YakitButton
                            key="import"
                            onClick={(e) => {
                              e.stopPropagation()
                              onExport(data)
                            }}
                            type="text2"
                            icon={<OutlineExportIcon />}
                          />
                        </div>
                      )}
                    />
                  )
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
                <YakitEmpty title="暂无数据" description="可新建技能,创建属于自己的技能" />
                <div className={styles['refresh-buttons']}>
                  <YakitButton type="outline1" icon={<OutlinePlusIcon />} onClick={onNewForge}>
                    新建技能
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
      <BatchExportAIforge ref={batchExportRef} />
      <ImportAIforge ref={importRef} onSuccess={handleEmiterTriggerRefresh} />
    </div>
  )
})

export default AIForgePage
