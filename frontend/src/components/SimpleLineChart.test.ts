import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SimpleLineChart from './SimpleLineChart.vue';

describe('SimpleLineChart', () => {
  it('renders a lightweight SVG line without a chart runtime dependency', () => {
    const wrapper = mount(SimpleLineChart, {
      props: {
        points: [
          { x: '2026-08-01T00:00:00Z', y: 1 },
          { x: '2026-08-02T00:00:00Z', y: 3 },
        ],
        minY: 1,
        maxY: 3,
      },
    });

    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('circle')).toHaveLength(2);
    expect(wrapper.find('polyline').attributes('points')).toContain(',');
    expect(wrapper.findAll('title')[1].text()).toContain('3');
  });
});
