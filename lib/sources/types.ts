/**
 * 数据源的共享类型契约。
 *
 * 这里只放「形状约定」，不含任何运行逻辑——核心调度、各个源、UI 都依赖这份契约，
 * 从而互不直接依赖（方案第 7 节：核心永远只跟统一形状打交道，不认识具体源）。
 */

/**
 * 抓取归一化产物：与「来自哪个源、是 RSS 还是 HTML」无关的统一条目形状。
 * 本阶段抓取流程的终点——每个源的 fetch() 都把自己的原始数据收敛成 RawItem[]。
 */
export interface RawItem {
  /** 来自哪个源，如 'openai'。用于回填来源徽标、做去重与状态归属。 */
  sourceId: string;
  /** 原文标题（英文）。 */
  title: string;
  /** 原文链接。永远保留，保证可溯源（方案第 6 节）。 */
  link: string;
  /** ISO 8601 发布时间字符串。统一格式便于排序，且字符串序即时间序，好按「近 24–48h」过滤。 */
  publishedAt: string;
  /** 正文/摘要原文。将来喂给 DeepSeek 总结；本阶段只是原样搬运。 */
  content: string;
  /** 去重用唯一标识。源未提供时，调用方回退用 link。 */
  guid?: string;
}

/**
 * 最终简报条目 = RawItem + AI 中文产物。
 * 本阶段不产出，仅先把「最终形状」钉死；将来 summarize 按此契约填充中文字段。
 */
export interface NewsItem extends RawItem {
  /** 中文标题（DeepSeek 产出，专有名词保留英文）。 */
  titleZh: string;
  /** 中文摘要（DeepSeek 产出）。 */
  summaryZh: string;
}

/**
 * 统一的数据源接口（方案第 7 节的「插头」）。
 * 每个源长一样：怎么抓是它的内部事，对外只吐归一化好的 RawItem[]。
 */
export interface NewsSource {
  /** 机器用的稳定标识，如 'openai'。做 key、去重、状态归属。 */
  id: string;
  /** 人看的显示名，如 'OpenAI'。UI 徽标用。 */
  label: string;
  /** 该源自行完成抓取与归一化，返回统一形状的条目。 */
  fetch(): Promise<RawItem[]>;
}

/**
 * 单个源的抓取结果（带状态）。
 * 方案要求「如实标注每源是否取到、宁可少一个源不可整页挂」，所以结果必须携带成败状态。
 */
export interface SourceFetchResult {
  sourceId: string;
  label: string;
  /** 'ok'：成功（含 0 条）；'error'：彻底失败。不单设 empty 态，0 条由 UI 判断。 */
  status: "ok" | "error";
  /** 成功时的归一化条目；失败时为空数组。 */
  items: RawItem[];
  /** 失败原因简述，供页面显示「Anthropic：今日源不可用」。成功时不设。 */
  error?: string;
}
