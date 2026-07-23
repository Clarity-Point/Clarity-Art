import { ref, computed } from 'vue';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { storeToRefs } from 'pinia';

interface CalendarCell {
  day: number;
  inMonth: boolean;
  hasEntry: boolean;
  isToday: boolean;
}

/**
 * Month calendar + entry-frequency metrics for DiaryView, built purely from
 * diary entry dates (no backend, no module-scope Date.now/Math.random).
 * Extracted verbatim to preserve the Monday-first grid and metrics text.
 */
export function useDiaryCalendar() {
  const userProfileStore = useUserProfileStore();
  const { profile } = storeToRefs(userProfileStore);

  const diaryEntries = computed(() => profile.value.diaryEntries || []);

  const getEntryFrequencyMetrics = (): string => {
    if (diaryEntries.value.length === 0) return 'Нет записей.';
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const entriesLastWeek = diaryEntries.value.filter((e) => new Date(e.date) >= oneWeekAgo).length;
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const entriesLastMonth = diaryEntries.value.filter(
      (e) => new Date(e.date) >= oneMonthAgo,
    ).length;
    return `Записей за последнюю неделю: ${entriesLastWeek}. Записей за последний месяц: ${entriesLastMonth}. Всего записей: ${diaryEntries.value.length}.`;
  };

  const weekDayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const calendarMonth = ref(new Date());
  calendarMonth.value.setDate(1);

  const prevMonth = () => {
    const d = new Date(calendarMonth.value);
    d.setMonth(d.getMonth() - 1);
    calendarMonth.value = d;
  };

  const nextMonth = () => {
    const d = new Date(calendarMonth.value);
    d.setMonth(d.getMonth() + 1);
    calendarMonth.value = d;
  };

  const monthLabel = computed(() =>
    calendarMonth.value.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
  );

  const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const entryDayKeys = computed(() => {
    const keys = new Set<string>();
    diaryEntries.value.forEach((entry) => {
      keys.add(dateKey(new Date(entry.date)));
    });
    return keys;
  });

  const calendarDays = computed<CalendarCell[]>(() => {
    const year = calendarMonth.value.getFullYear();
    const month = calendarMonth.value.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // JS getDay(): 0=Sun..6=Sat — shift so the week starts on Monday.
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayKey = dateKey(today);

    const cells: CalendarCell[] = [];

    for (let i = 0; i < leadingBlanks; i++) {
      const d = new Date(year, month, 1 - (leadingBlanks - i));
      cells.push({
        day: d.getDate(),
        inMonth: false,
        hasEntry: entryDayKeys.value.has(dateKey(d)),
        isToday: false,
      });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({
        day,
        inMonth: true,
        hasEntry: entryDayKeys.value.has(dateKey(d)),
        isToday: dateKey(d) === todayKey,
      });
    }
    const trailingBlanks = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= trailingBlanks; i++) {
      const d = new Date(year, month + 1, i);
      cells.push({
        day: d.getDate(),
        inMonth: false,
        hasEntry: entryDayKeys.value.has(dateKey(d)),
        isToday: false,
      });
    }

    return cells;
  });

  return {
    weekDayLabels,
    monthLabel,
    prevMonth,
    nextMonth,
    calendarDays,
    getEntryFrequencyMetrics,
  };
}
