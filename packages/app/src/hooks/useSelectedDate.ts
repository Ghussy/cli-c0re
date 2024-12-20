import dayjs from 'dayjs'
import { create } from 'zustand'

const appStore = create<{
  selectedDate: dayjs.Dayjs
  setSelectedDate: (date: dayjs.Dayjs) => void
}>((set) => ({
  selectedDate: dayjs().startOf('day'),
  setSelectedDate: (date) => set({ selectedDate: date }),
}))

const useSelectedDate = () => {
  const { selectedDate, setSelectedDate } = appStore()
  return { selectedDate, setSelectedDate }
}

const weekAppStore = create<{
  selectedDate: dayjs.Dayjs
  setSelectedDate: (date: dayjs.Dayjs) => void
  isCurrentWeek: () => boolean
  isMonthAgo: () => boolean
}>((set, get) => ({
  selectedDate: dayjs().startOf('week').subtract(1, 'week').add(1, 'day'),
  setSelectedDate: (date) => set({ selectedDate: date }),
  isCurrentWeek: () => {
    const state = get()
    return state.selectedDate.isSame(dayjs().startOf('isoWeek'), 'week')
  },
  isMonthAgo: () => {
    const state = get()
    return state.selectedDate.isBefore(dayjs().subtract(1, 'month'), 'day')
  },
}))

const useSelectedWeekDate = () => {
  const { selectedDate, setSelectedDate, isCurrentWeek, isMonthAgo } =
    weekAppStore()
  return { selectedDate, setSelectedDate, isCurrentWeek, isMonthAgo }
}

export { useSelectedDate, useSelectedWeekDate }
