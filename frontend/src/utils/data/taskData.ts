import {
  CalendarDays,
  Clock,
  CheckCircle,
  Type,
  Star,
  Tag,
  Hash,
  ListChecks,
  FileText,
  ArrowUpDown,
} from "lucide-react";

import {
  HiOutlineClipboard,
  HiOutlineLightBulb,
  HiOutlineSparkles,
} from "react-icons/hi2";
import { HiOutlineViewList } from "react-icons/hi";

export const TaskPriorities = [
  { id: "LOW", name: "Low", value: "LOW", color: "#6b7280" },
  { id: "MEDIUM", name: "Medium", value: "MEDIUM", color: "#f59e0b" },
  { id: "HIGH", name: "High", value: "HIGH", color: "#ef4444" },
  { id: "HIGHEST", name: "Highest", value: "HIGHEST", color: "#dc2626" },
];

export const labelColors = [
  { name: "Blue", value: "#3B82F6" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Green", value: "#10B981" },
  { name: "Yellow", value: "#F59E0B" },
  { name: "Red", value: "#EF4444" },
  { name: "Gray", value: "#6B7280" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Pink", value: "#EC4899" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Orange", value: "#F97316" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Lime", value: "#65A30D" },
];

export const PRIORITY_OPTIONS = [
  {
    value: "LOW",
    label: "Low",
    color: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
  },
  {
    value: "MEDIUM",
    label: "Medium",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
  },
  {
    value: "HIGH",
    label: "High",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
  },
  {
    value: "HIGHEST",
    label: "Highest",
    color: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
  },
];

export const TASK_TYPE_OPTIONS = [
  { value: "TASK", label: "Task" },
  { value: "HABIT", label: "Habit" },
  { value: "STUDY", label: "Study" },
  { value: "WORK", label: "Work" },
  { value: "LIFE", label: "Life" },
  { value: "GOAL", label: "Goal" },
  { value: "EVENT", label: "Event" },
  { value: "NOTE", label: "Note" },
  { value: "PROJECT", label: "Project" },
  { value: "SUBTASK", label: "Subtask" },
];

export const DEFAULT_SORT_FIELDS = [
  { value: "listRank", label: "Rank", icon: ArrowUpDown, category: "number" },
  { value: "createdAt", label: "Created Date", icon: Clock, category: "date" },
  { value: "updatedAt", label: "Updated Date", icon: CalendarDays, category: "date" },
  { value: "dueDate", label: "Due Date", icon: CalendarDays, category: "date" },
  { value: "dueIn", label: "Due In", icon: Clock, category: "date" },
  { value: "completedAt", label: "Completed Date", icon: CheckCircle, category: "date" },
  { value: "title", label: "Task Title", icon: Type, category: "text" },
  { value: "priority", label: "Priority", icon: Star, category: "text" },
  { value: "status", label: "Status", icon: Tag, category: "text" },
  { value: "taskNumber", label: "Task Number", icon: Hash, category: "number" },
  { value: "storyPoints", label: "Story Points", icon: ListChecks, category: "number" },
  { value: "commentsCount", label: "Comments", icon: FileText, category: "number" },
];

export const TaskTypeIcon = {
  TASK: { label: "Task", icon: HiOutlineClipboard, color: "blue-500" },
  HABIT: { label: "Habit", icon: HiOutlineSparkles, color: "teal-500" },
  STUDY: { label: "Study", icon: HiOutlineLightBulb, color: "indigo-500" },
  WORK: { label: "Work", icon: HiOutlineClipboard, color: "amber-500" },
  LIFE: { label: "Life", icon: HiOutlineSparkles, color: "pink-500" },
  GOAL: { label: "Goal", icon: HiOutlineSparkles, color: "purple-500" },
  EVENT: { label: "Event", icon: HiOutlineClipboard, color: "cyan-500" },
  NOTE: { label: "Note", icon: HiOutlineClipboard, color: "slate-500" },
  PROJECT: { label: "Project", icon: HiOutlineSparkles, color: "purple-500" },
  SUBTASK: { label: "Subtask", icon: HiOutlineViewList, color: "orange-500" },
} as const;

// Task Type Color mapping from Tailwind class to hex
export const TaskTypeColorMap: Record<string, string> = {
  "blue-500": "#3B82F6",
  "green-500": "#10B981",
  "red-500": "#EF4444",
  "purple-500": "#8B5CF6",
  "orange-500": "#F97316",
  "teal-500": "#14B8A6",
  "indigo-500": "#6366F1",
  "amber-500": "#F59E0B",
  "pink-500": "#EC4899",
  "cyan-500": "#06B6D4",
  "slate-500": "#64748B",
};

// Helper function to get hex color from task type
export const getTaskTypeHexColor = (taskType: keyof typeof TaskTypeIcon): string => {
  const color = TaskTypeIcon[taskType]?.color;
  return TaskTypeColorMap[color] || "#6B7280"; // Default gray
};
