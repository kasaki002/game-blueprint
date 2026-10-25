/** Config-driven node template system. */
 
 export type NodeFieldType = "text" | "number" | "boolean" | "select" | "textarea" | "color" | "array";
 
 export interface NodeField {
   name: string;
   label: string;
   type: NodeFieldType;
   required?: boolean;
   default?: unknown;
   options?: string[];
   min?: number;
   max?: number;
   step?: number;
 }
 
 export interface NodeTemplate {
   type: string;
   category: string;
   label: string;
   description: string;
   icon: string;
   color: string;
   fields: NodeField[];
   containerType?: "zone" | "list";
 }
 
 export const NodeCategories = {
   CORE: "核心设计",
   NARRATIVE: "叙事",
   MECHANIC: "机制",
   REFERENCE: "参考",
 } as const;
 
 export const NodeTemplates: Record<string, NodeTemplate> = {
   scene: {
     type: "scene",
     category: NodeCategories.CORE,
     label: "场景",
     description: "定义游戏场景的氛围与环境参数",
     icon: "🏔️",
     color: "#4CAF50",
     fields: [
       { name: "name", label: "场景名称", type: "text", required: true, default: "新场景" },
       { name: "atmosphere", label: "氛围", type: "select", options: ["明亮", "阴暗", "神秘", "紧张", "宁静"], default: "明亮" },
       { name: "environment", label: "环境描述", type: "textarea", default: "" },
     ],
   },
   level: {
     type: "level",
     category: NodeCategories.CORE,
     label: "关卡",
     description: "设计关卡布局与难度曲线",
     icon: "🗺️",
     color: "#2196F3",
     fields: [
       { name: "name", label: "关卡名称", type: "text", required: true, default: "新关卡" },
       { name: "difficulty", label: "难度", type: "select", options: ["简单", "普通", "困难", "极难"], default: "普通" },
       { name: "layout", label: "布局描述", type: "textarea", default: "" },
     ],
   },
   character: {
     type: "character",
     category: NodeCategories.CORE,
     label: "角色",
     description: "角色属性、技能与AI行为设计",
     icon: "⚔️",
     color: "#FF5722",
     fields: [
       { name: "name", label: "角色名称", type: "text", required: true, default: "新角色" },
       { name: "hp", label: "生命值", type: "number", default: 100, min: 0, max: 500, step: 5 },
       { name: "attack", label: "攻击力", type: "number", default: 10, min: 0, max: 100, step: 1 },
       { name: "defense", label: "防御力", type: "number", default: 10, min: 0, max: 100, step: 1 },
       { name: "role_type", label: "角色类型", type: "select", options: ["主角", "NPC", "敌人", "BOSS"], default: "主角" },
     ],
   },
   item: {
     type: "item",
     category: NodeCategories.CORE,
     label: "物品",
     description: "游戏物品与装备设计",
     icon: "📦",
     color: "#9C27B0",
     fields: [
       { name: "name", label: "物品名称", type: "text", required: true, default: "新物品" },
       { name: "type", label: "类型", type: "select", options: ["武器", "防具", "消耗品", "关键道具", "材料"], default: "消耗品" },
       { name: "effect", label: "效果描述", type: "textarea", default: "" },
     ],
   },
   skill: {
     type: "skill",
     category: NodeCategories.CORE,
     label: "技能",
     description: "技能消耗、效果与冷却设计",
     icon: "⚡",
     color: "#FF9800",
     fields: [
       { name: "name", label: "技能名称", type: "text", required: true, default: "新技能" },
       { name: "cost", label: "消耗", type: "number", default: 10, min: 0, max: 100, step: 1 },
       { name: "cooldown", label: "冷却(秒)", type: "number", default: 5, min: 0, max: 60, step: 0.5 },
       { name: "effect", label: "效果", type: "textarea", default: "" },
     ],
   },
   storyline: {
     type: "storyline",
     category: NodeCategories.NARRATIVE,
     label: "故事线",
     description: "叙事分支与关键节点",
     icon: "📖",
     color: "#E91E63",
     fields: [
       { name: "name", label: "故事线名称", type: "text", required: true, default: "新故事线" },
       { name: "trigger", label: "触发条件", type: "text", default: "" },
       { name: "branches", label: "分支选项", type: "array", default: [] },
     ],
   },
   mechanic: {
     type: "mechanic",
     category: NodeCategories.MECHANIC,
     label: "机制",
     description: "核心游戏机制与数值公式",
     icon: "⚙️",
     color: "#607D8B",
     fields: [
       { name: "name", label: "机制名称", type: "text", required: true, default: "新机制" },
       { name: "formula", label: "数值公式", type: "text", default: "" },
       { name: "description", label: "规则描述", type: "textarea", default: "" },
     ],
   },
   reference: {
     type: "reference",
     category: NodeCategories.REFERENCE,
     label: "参考素材",
     description: "从分析模块拖拽的参考数据",
     icon: "🔗",
     color: "#795548",
     fields: [
       { name: "source", label: "来源", type: "text", default: "" },
       { name: "summary", label: "摘要", type: "textarea", default: "" },
       { name: "url", label: "链接", type: "text", default: "" },
     ],
   },
 };
 
 export function getTemplatesByCategory(): Record<string, NodeTemplate[]> {
   const grouped: Record<string, NodeTemplate[]> = {};
   for (const tpl of Object.values(NodeTemplates)) {
     const cat = tpl.category || "其他";
     if (!grouped[cat]) grouped[cat] = [];
     grouped[cat].push(tpl);
   }
   return grouped;
 }
