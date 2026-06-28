import { anthropicSource } from "./anthropic";
import { openaiSource } from "./openai";
import type { NewsSource } from "./types";

/**
 * 数据源清单——整个系统里唯一列出「有哪些源」的地方。
 *
 * 核心调度只 import 这个数组、遍历它，永远不出现任何具体源的名字（方案第 7 节）。
 *
 * 加一个新源（如 Google AI 博客）只改这一个文件，两行：
 *   1) import { googleaiSource } from './googleai';
 *   2) 把 googleaiSource 加进下面的数组。
 * 抓取框架 / 总结 / 存储 / 渲染一行都不用动。
 *
 * 类型标注为 NewsSource[]，将来加入不符合接口的对象会被 TS 当场拦下。
 */
export const SOURCES: NewsSource[] = [openaiSource, anthropicSource];
