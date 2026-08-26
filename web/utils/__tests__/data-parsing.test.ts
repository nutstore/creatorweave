/**
 * Tests for data parsing utilities
 */

import { describe, it, expect } from 'vitest'
import {
  parseCSV,
  parseJSON,
  detectColumnTypes,
  calculateColumnStats,
  calculateAllStats,
  filterData,
  aggregateData,
  exportToCSV,
  exportToJSON,
  type ParsedData,
} from '../data-parsing'

describe('CSV Parsing', () => {
  it('should parse simple CSV', () => {
    const csv = `name,age,city
John,30,New York
Jane,25,Los Angeles`

    const result = parseCSV(csv)

    expect(result.headers).toEqual(['name', 'age', 'city'])
    expect(result.rowCount).toBe(2)
    expect(result.rows).toEqual([
      { name: 'John', age: '30', city: 'New York' },
      { name: 'Jane', age: '25', city: 'Los Angeles' },
    ])
  })

  it('should handle quoted fields', () => {
    const csv = `name,description
John,"Developer, Senior"
Jane,"Designer"`

    const result = parseCSV(csv)

    expect(result.rows).toEqual([
      { name: 'John', description: 'Developer, Senior' },
      { name: 'Jane', description: 'Designer' },
    ])
  })

  it('should detect column types', () => {
    const csv = `name,age,salary,active
John,30,50000,true
Jane,25,60000,false`

    const result = parseCSV(csv)

    expect(result.columns[0].type).toBe('string')
    expect(result.columns[1].type).toBe('number')
    expect(result.columns[2].type).toBe('number')
    expect(result.columns[3].type).toBe('boolean')
  })

  it('should parse CSV without headers', () => {
    const csv = `John,30,New York
Jane,25,Los Angeles`

    const result = parseCSV(csv, { hasHeader: false })

    // When hasHeader is false, the first row is treated as data
    // Headers are generated from the first data row
    expect(result.rowCount).toBe(2)
    expect(result.rows).toHaveLength(2)
  })
})

describe('JSON Parsing', () => {
  it('should parse array of objects', () => {
    const json = JSON.stringify([
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
    ])

    const result = parseJSON(json)

    expect(result.headers).toEqual(['name', 'age'])
    expect(result.rowCount).toBe(2)
    expect(result.rows).toEqual([
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
    ])
  })

  it('should parse single object', () => {
    const json = JSON.stringify({ name: 'John', age: 30 })

    const result = parseJSON(json)

    expect(result.headers).toEqual(['name', 'age'])
    expect(result.rowCount).toBe(1)
  })

  it('should parse array of primitives', () => {
    const json = JSON.stringify([10, 20, 30, 40])

    const result = parseJSON(json)

    expect(result.headers).toEqual(['value'])
    expect(result.rowCount).toBe(4)
    expect(result.rows).toEqual([{ value: 10 }, { value: 20 }, { value: 30 }, { value: 40 }])
  })

  it('should throw on invalid JSON', () => {
    expect(() => parseJSON('invalid json')).toThrow()
  })
})

describe('Column Type Detection', () => {
  it('should detect numeric columns', () => {
    const rows = [
      { col1: 10, col2: 20 },
      { col1: 15, col2: 25 },
    ]
    const columns = detectColumnTypes(rows, ['col1', 'col2'])

    expect(columns[0].type).toBe('number')
    expect(columns[1].type).toBe('number')
  })

  it('should detect boolean columns', () => {
    const rows = [
      { col1: true, col2: false },
      { col1: false, col2: true },
    ]
    const columns = detectColumnTypes(rows, ['col1', 'col2'])

    expect(columns[0].type).toBe('boolean')
    expect(columns[1].type).toBe('boolean')
  })

  it('should detect string columns', () => {
    const rows = [
      { col1: 'hello', col2: 'world' },
      { col1: 'foo', col2: 'bar' },
    ]
    const columns = detectColumnTypes(rows, ['col1', 'col2'])

    expect(columns[0].type).toBe('string')
    expect(columns[1].type).toBe('string')
  })
})

describe('Statistics Calculation', () => {
  it('should calculate numeric statistics', () => {
    const rows = [{ value: 10 }, { value: 20 }, { value: 30 }, { value: null }]
    const stats = calculateColumnStats(rows, 'value')

    expect(stats.count).toBe(3)
    expect(stats.nullCount).toBe(1)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(30)
    expect(stats.avg).toBe(20)
    expect(stats.sum).toBe(60)
  })

  it('should calculate all column stats', () => {
    const data: ParsedData = {
      headers: ['col1', 'col2'],
      rows: [
        { col1: 10, col2: 'a' },
        { col1: 20, col2: 'b' },
        { col1: 30, col2: 'a' },
      ],
      columns: [
        { name: 'col1', type: 'number', nullable: false, unique: 3, examples: [10, 20, 30] },
        { name: 'col2', type: 'string', nullable: false, unique: 2, examples: ['a', 'b'] },
      ],
      rowCount: 3,
      columnCount: 2,
    }
    const stats = calculateAllStats(data)

    expect(stats.size).toBe(2)
    expect(stats.get('col1')?.min).toBe(10)
    expect(stats.get('col1')?.max).toBe(30)
  })
})

describe('Data Filtering', () => {
  it('should filter by equality', () => {
    const rows = [
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
      { name: 'Bob', age: 30 },
    ]
    const filtered = filterData(rows, [{ column: 'age', operator: 'eq', value: 30 }])

    expect(filtered).toHaveLength(2)
    expect(filtered[0].name).toBe('John')
    expect(filtered[1].name).toBe('Bob')
  })

  it('should filter by greater than', () => {
    const rows = [
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
      { name: 'Bob', age: 35 },
    ]
    const filtered = filterData(rows, [{ column: 'age', operator: 'gt', value: 30 }])

    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Bob')
  })

  it('should filter by contains', () => {
    const rows = [{ name: 'John Doe' }, { name: 'Jane Smith' }, { name: 'Bob Johnson' }]
    const filtered = filterData(rows, [{ column: 'name', operator: 'contains', value: 'John' }])

    expect(filtered).toHaveLength(2)
  })

  it('should apply multiple filters', () => {
    const rows = [
      { name: 'John', age: 30, city: 'NYC' },
      { name: 'Jane', age: 25, city: 'LA' },
      { name: 'Bob', age: 35, city: 'NYC' },
    ]
    const filtered = filterData(rows, [
      { column: 'city', operator: 'eq', value: 'NYC' },
      { column: 'age', operator: 'gt', value: 30 },
    ])

    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Bob')
  })
})

describe('Data Aggregation', () => {
  it('should aggregate with count', () => {
    const rows = [
      { category: 'A', value: 10 },
      { category: 'A', value: 20 },
      { category: 'B', value: 30 },
    ]
    const result = aggregateData(rows, 'category', { value: 'count' })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ category: 'A', value: 2 })
    expect(result[1]).toMatchObject({ category: 'B', value: 1 })
  })

  it('should aggregate with sum', () => {
    const rows = [
      { category: 'A', value: 10 },
      { category: 'A', value: 20 },
      { category: 'B', value: 30 },
    ]
    const result = aggregateData(rows, 'category', { value: 'sum' })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ category: 'A', value: 30 })
    expect(result[1]).toMatchObject({ category: 'B', value: 30 })
  })

  it('should aggregate with avg', () => {
    const rows = [
      { category: 'A', value: 10 },
      { category: 'A', value: 20 },
      { category: 'B', value: 30 },
    ]
    const result = aggregateData(rows, 'category', { value: 'avg' })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ category: 'A', value: 15 })
    expect(result[1]).toMatchObject({ category: 'B', value: 30 })
  })
})

describe('Data Export', () => {
  it('should export to CSV', () => {
    const data: ParsedData = {
      headers: ['name', 'age'],
      rows: [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ],
      columns: [],
      rowCount: 2,
      columnCount: 2,
    }
    const csv = exportToCSV(data)

    expect(csv).toContain('name,age')
    expect(csv).toContain('John,30')
    expect(csv).toContain('Jane,25')
  })

  it('should export to JSON', () => {
    const data: ParsedData = {
      headers: ['name', 'age'],
      rows: [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ],
      columns: [],
      rowCount: 2,
      columnCount: 2,
    }
    const json = exportToJSON(data, true)

    const parsed = JSON.parse(json)
    expect(parsed).toEqual([
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
    ])
  })

  it('should escape CSV special characters', () => {
    const data: ParsedData = {
      headers: ['name', 'description'],
      rows: [
        { name: 'John', description: 'Developer, Senior' },
        { name: 'Jane', description: 'Has "quotes"' },
      ],
      columns: [],
      rowCount: 2,
      columnCount: 2,
    }
    const csv = exportToCSV(data)

    expect(csv).toContain('"Developer, Senior"')
    expect(csv).toContain('"Has ""quotes"""')
  })
})
