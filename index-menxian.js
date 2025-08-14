const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const router = express.Router();

// CORS配置 - 允许所有来源
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 数据库文件路径
const dbPath = path.join(__dirname, '..', 'productiondata_db.db');

// 检查文件是否存在
if (!fs.existsSync(dbPath)) {
  console.error('数据库文件不存在！路径:', dbPath);
  process.exit(1);
}

// 创建数据库连接
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('成功连接到数据库');
  }
});

// 专门基于车辆ID去重的函数
function removeDuplicatesByVehicleId(rows) {
  if (!Array.isArray(rows)) {
    console.warn('去重函数接收到非数组数据:', typeof rows);
    return [];
  }

  const vehicleIdMap = new Map(); // 使用Map来存储每个车辆ID的最新记录
  let duplicateCount = 0;

  for (const row of rows) {
    if (!row || typeof row !== 'object' || !row.ordernum) {
      continue; // 跳过无效数据或没有车辆ID的数据
    }

    const vehicleId = row.ordernum;

    // 如果这个车辆ID还没有记录，或者当前记录的时间更新，则更新记录
    if (!vehicleIdMap.has(vehicleId) ||
      (row.datetime && vehicleIdMap.get(vehicleId).datetime &&
        new Date(row.datetime) > new Date(vehicleIdMap.get(vehicleId).datetime))) {
      vehicleIdMap.set(vehicleId, row);
    } else {
      duplicateCount++;
    }
  }

  const uniqueRows = Array.from(vehicleIdMap.values());

  if (duplicateCount > 0) {
    console.log(`基于车辆ID去重完成: 原始数据 ${rows.length} 条，去重后 ${uniqueRows.length} 条，移除重复车辆 ${duplicateCount} 条`);
  }

  return uniqueRows;
}

// 按车型过滤数据的函数
function filterByCarType(rows, carType) {
  if (!carType || carType === 'ALL') {
    return rows;
  }
  return rows.filter(row => row.cartype === carType);
}

// 若未定义，添加车型参数标准化函数
if (typeof normalizeCarType !== 'function') {
  function normalizeCarType(input) {
    if (!input) return 'ALL';
    let value = String(input).trim().toUpperCase();
    if (value === 'ALL') return 'ALL';
    if (!value.startsWith('V')) {
      value = `V${value}`;
    }
    return value;
  }
}

// 获取结果汇总
router.get('/api/statistic', (req, res) => {
  try {
    const { carType = 'ALL' } = req.query; // 支持车型参数，默认为ALL
    const carTypeNormalized = normalizeCarType(carType);

    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 从所有表中查询数据
      const tablePromises = tables.map(table => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT * FROM "${table.name}"`, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          // 合并所有表的数据
          const allRows = results.flat();

          // 按车型过滤数据（使用标准化后的车型）
          const filteredRows = filterByCarType(allRows, carTypeNormalized);

          // 基于每天唯一订单进行统计
          const dateToOrderSet = new Map();
          for (const row of filteredRows) {
            if (!row || !row.datetime || !row.ordernum) continue;
            const date = new Date(row.datetime).toISOString().split('T')[0];
            if (!dateToOrderSet.has(date)) dateToOrderSet.set(date, new Set());
            dateToOrderSet.get(date).add(String(row.ordernum));
          }

          const today = new Date().toISOString().split('T')[0];
          const todayCount = dateToOrderSet.has(today) ? dateToOrderSet.get(today).size : 0;

          // 最近有数据的7天（按日期倒序取7个），周合计为这7天的唯一订单总量
          const recent7Dates = Array.from(dateToOrderSet.keys())
            .sort((a, b) => new Date(b) - new Date(a))
            .slice(0, 7);
          const weekCount = recent7Dates.reduce((sum, d) => sum + (dateToOrderSet.get(d)?.size || 0), 0);

          // 总计：全量唯一订单数
          const totalOrderSet = new Set();
          for (const row of filteredRows) {
            if (row && row.ordernum) totalOrderSet.add(String(row.ordernum));
          }
          const totalCountNumber = totalOrderSet.size;

          // 获取所有不同的车辆型号
          const vehicleModels = [...new Set(filteredRows.map(row => row.cartype).filter(Boolean))];
          const currentModel = vehicleModels[0] || (carTypeNormalized === 'ALL' ? 'V254' : carTypeNormalized);

          res.json({
            todayCount,
            weekCount,
            totalCount: `${Math.floor(totalCountNumber / 1000)} 千`,
            currentModel,
            carType: carTypeNormalized // 返回当前查询的车型
          });
        })
        .catch(error => {
          console.error('查询数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});
// 获取结果汇总
router.get('/api/barOK', (req, res) => {
  try {
    const { carType = 'ALL' } = req.query; // 支持车型参数，默认为ALL
    const carTypeNormalized = normalizeCarType(carType);
    
    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 仅选择 Qualitydata_* 表
      const qualityTables = tables
        .map(t => t.name)
        .filter(name => /^Qualitydata_/.test(name));

      // 每个表只查询必要字段，并在SQL层按车型与时间过滤（不限制7天，让后续取最近有数据的7天）
      const tablePromises = qualityTables.map(tableName => {
        return new Promise((resolve, reject) => {
          const whereCarType = carTypeNormalized === 'ALL' ? '' : 'AND cartype = ?';
          const sql = `SELECT ordernum, datetime FROM "${tableName}" WHERE result = 'OK' AND datetime IS NOT NULL ${whereCarType}`;
          const params = carTypeNormalized === 'ALL' ? [] : [carTypeNormalized];
          db.all(sql, params, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows || []);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          const rows = results.flat();

          // 统计：按天唯一车辆（ordernum）计数
          const dateToOrderSet = new Map();
          for (const row of rows) {
            if (!row || !row.datetime || !row.ordernum) continue;
            const date = new Date(row.datetime).toISOString().split('T')[0];
            if (!dateToOrderSet.has(date)) dateToOrderSet.set(date, new Set());
            dateToOrderSet.get(date).add(String(row.ordernum));
          }

          // 取最近有数据的7个日期（按日期倒序）
          const sortedDatesDesc = Array.from(dateToOrderSet.keys())
            .sort((a, b) => new Date(b) - new Date(a))
            .slice(0, 7);

          const result = sortedDatesDesc.map(date => ({
            name: date,
            value: dateToOrderSet.get(date).size
          }));

          res.json(result);
        })
        .catch(error => {
          console.error('查询数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});
// 获取结果汇总
router.get('/api/barNG', (req, res) => {
  try {
    const { carType = 'ALL' } = req.query; // 支持车型参数，默认为ALL
    const carTypeNormalized = normalizeCarType(carType);

    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 仅选择 Qualitydata_* 表
      const qualityTables = tables
        .map(t => t.name)
        .filter(name => /^Qualitydata_/.test(name));

      // 每个表只查询必要字段，并在SQL层按车型过滤（不限制7天，让后续取最近有数据的7天）
      const tablePromises = qualityTables.map(tableName => {
        return new Promise((resolve, reject) => {
          const whereCarType = carTypeNormalized === 'ALL' ? '' : 'AND cartype = ?';
          const sql = `SELECT ordernum, datetime FROM "${tableName}" WHERE result = 'NG' AND datetime IS NOT NULL ${whereCarType}`;
          const params = carTypeNormalized === 'ALL' ? [] : [carTypeNormalized];
          db.all(sql, params, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows || []);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          const rows = results.flat();

          // 统计：按天唯一车辆（ordernum）计数
          const dateToOrderSet = new Map();
          for (const row of rows) {
            if (!row || !row.datetime || !row.ordernum) continue;
            const date = new Date(row.datetime).toISOString().split('T')[0];
            if (!dateToOrderSet.has(date)) dateToOrderSet.set(date, new Set());
            dateToOrderSet.get(date).add(String(row.ordernum));
          }

          // 取最近有数据的7个日期（按日期倒序）
          const sortedDatesDesc = Array.from(dateToOrderSet.keys())
            .sort((a, b) => new Date(b) - new Date(a))
            .slice(0, 7);

          const result = sortedDatesDesc.map(date => ({
            name: date,
            value: dateToOrderSet.get(date).size
          }));

          res.json(result);
        })
        .catch(error => {
          console.error('查询数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});
// 获取结果汇总
router.get('/api/pieALL', (req, res) => {
  try {
    const { carType = 'ALL' } = req.query; // 支持车型参数，默认为ALL
    const carTypeNormalized = normalizeCarType(carType);
    
    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 从所有表中查询数据
      const tablePromises = tables.map(table => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT * FROM "${table.name}"`, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          // 合并所有表的数据
          const allRows = results.flat();

          // 按车型过滤数据
          const filteredRows = filterByCarType(allRows, carTypeNormalized);

          // 仅使用点位数据（包含 errtype 的行），不做按车辆去重
          const pointRows = filteredRows.filter(row => row && row.errtype);

          // 统计缺陷分布
          const data = pointRows.reduce((acc, row) => {
            const defect = row.errtype || '未知缺陷';
            const existing = acc.find(item => item.name === defect);
            if (existing) {
              existing.value++;
            } else {
              acc.push({ name: defect, value: 1 });
            }
            return acc;
          }, []);

          res.json(data);
        })
        .catch(error => {
          console.error('查询数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});
// 获取结果汇总
router.get('/api/pieWEEK', (req, res) => {
  try {
    const { carType = 'ALL' } = req.query; // 支持车型参数，默认为ALL
    const carTypeNormalized = normalizeCarType(carType);
    
    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 从所有表中查询数据
      const tablePromises = tables.map(table => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT * FROM "${table.name}"`, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          // 合并所有表的数据
          const allRows = results.flat();

          // 按车型过滤数据
          const filteredRows = filterByCarType(allRows, carTypeNormalized);

          // 仅使用点位数据（包含 errtype 的行）
          const pointRows = filteredRows.filter(row => row && row.errtype && row.datetime);

          // 取最近有数据的7个日期（按日期倒序）
          const datesWithData = Array.from(new Set(pointRows.map(r => new Date(r.datetime).toISOString().split('T')[0])))
            .sort((a, b) => new Date(b) - new Date(a))
            .slice(0, 7);
          const allowedDateSet = new Set(datesWithData);

          const data = pointRows
            .filter(r => allowedDateSet.has(new Date(r.datetime).toISOString().split('T')[0]))
            .reduce((acc, row) => {
              const defect = row.errtype || '未知缺陷';
              const existing = acc.find(item => item.name === defect);
              if (existing) {
                existing.value++;
              } else {
                acc.push({ 
                  id: acc.length + 1, // 添加唯一ID字段
                  name: defect, 
                  value: 1 
                });
              }
              return acc;
            }, []);

          // 兜底：若无数据，返回占位项避免前端/Power BI 报错
          if (data.length === 0) {
            return res.json([{ 
              id: 1, 
              name: '无数据', 
              value: 0 
            }]);
          }

          res.json(data);
        })
        .catch(error => {
          console.error('查询数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});
// 获取结果汇总
router.get('/api/line', (req, res) => {
  try {
    const { carType = 'ALL' } = req.query; // 支持车型参数，默认为ALL
    const carTypeNormalized = normalizeCarType(carType);
    
    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 从所有表中查询数据
      const tablePromises = tables.map(table => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT * FROM "${table.name}"`, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          // 合并所有表的数据
          const allRows = results.flat();

          // 按车型过滤数据
          const filteredRows = filterByCarType(allRows, carTypeNormalized);

          // 仅使用点位数据（包含 errtype 的行），统计“全部历史总计”的Top5缺陷
          const pointRows = filteredRows.filter(row => row && row.errtype && row.ordernum);

          // 每个缺陷对应的唯一订单集合
          const defectToOrders = new Map();
          for (const row of pointRows) {
            const defect = row.errtype || '未知缺陷';
            const orderId = String(row.ordernum);
            if (!defectToOrders.has(defect)) defectToOrders.set(defect, new Set());
            defectToOrders.get(defect).add(orderId);
          }

          // 转换为 { name, value }，value 为唯一订单数量
          const top = Array.from(defectToOrders.entries())
            .map(([name, set]) => ({ name, value: set.size }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

          res.json(top);
        })
        .catch(error => {
          console.error('查询数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取白班夜班OK数据
router.get('/api/barShiftOK', (req, res) => {
  try {
    const { carType = 'ALL' } = req.query; // 支持车型参数，默认为ALL
    const carTypeNormalized = normalizeCarType(carType);
    
    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 从所有表中查询数据
      const tablePromises = tables.map(table => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT * FROM "${table.name}"`, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          // 合并所有表的数据
          const allRows = results.flat();

          // 按车型过滤数据
          const filteredRows = filterByCarType(allRows, carTypeNormalized);

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(filteredRows);

          // 定义白班和夜班时间范围
          const getShift = (datetime) => {
            const hour = new Date(datetime).getHours();
            // 白班: 7:00-19:00 (7-18点)
            // 夜班: 19:00-7:00 (19-6点)
            return (hour >= 7 && hour < 19) ? '白班' : '夜班';
          };

          // 计算统计数据
          const today = new Date().toISOString().split('T')[0];

          // 处理OK数据，按班次分组
          const dayShiftData = uniqueRows
            .filter(row => row.result === 'OK' && getShift(row.datetime) === '白班')
            .reduce((acc, row) => {
              const date = row.datetime ? new Date(row.datetime).toISOString().split('T')[0] : today;
              const existing = acc.find(item => item.name === date);
              if (existing) {
                existing.value++;
              } else {
                acc.push({ name: date, value: 1 });
              }
              return acc;
            }, [])
            .sort((a, b) => new Date(b.name) - new Date(a.name))
            .slice(0, 7);

          const nightShiftData = uniqueRows
            .filter(row => row.result === 'OK' && getShift(row.datetime) === '夜班')
            .reduce((acc, row) => {
              const date = row.datetime ? new Date(row.datetime).toISOString().split('T')[0] : today;
              const existing = acc.find(item => item.name === date);
              if (existing) {
                existing.value++;
              } else {
                acc.push({ name: date, value: 1 });
              }
              return acc;
            }, [])
            .sort((a, b) => new Date(b.name) - new Date(a.name))
            .slice(0, 7);

          // 合并为 [{ name, value1, value2 }]
          const dateSet = new Set([
            ...dayShiftData.map(d => d.name),
            ...nightShiftData.map(d => d.name)
          ]);
          let allDates = Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b));
          allDates = allDates.slice(-7); // 只保留最近7天
          const dayMap = Object.fromEntries(dayShiftData.map(d => [d.name, d.value]));
          const nightMap = Object.fromEntries(nightShiftData.map(d => [d.name, d.value]));
          const result = allDates.map(date => ({
            name: date,
            value1: dayMap[date] || 0,
            value2: nightMap[date] || 0
          }));
          res.json(result);
        })
        .catch(error => {
          console.error('查询数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取白班夜班NG数据
router.get('/api/barShiftNG', (req, res) => {
  try {
    const { carType = 'ALL' } = req.query; // 支持车型参数，默认为ALL
    const carTypeNormalized = normalizeCarType(carType);
    
    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 从所有表中查询数据
      const tablePromises = tables.map(table => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT * FROM "${table.name}"`, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          // 合并所有表的数据
          const allRows = results.flat();

          // 按车型过滤数据
          const filteredRows = filterByCarType(allRows, carTypeNormalized);

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(filteredRows);

          // 定义白班和夜班时间范围
          const getShift = (datetime) => {
            const hour = new Date(datetime).getHours();
            // 白班: 7:00-19:00 (7-18点)
            // 夜班: 19:00-7:00 (19-6点)
            return (hour >= 7 && hour < 19) ? '白班' : '夜班';
          };

          // 计算统计数据
          const today = new Date().toISOString().split('T')[0];

          // 处理NG数据，按班次分组
          const dayShiftData = uniqueRows
            .filter(row => row.result === 'NG' && getShift(row.datetime) === '白班')
            .reduce((acc, row) => {
              const date = row.datetime ? new Date(row.datetime).toISOString().split('T')[0] : today;
              const existing = acc.find(item => item.name === date);
              if (existing) {
                existing.value++;
              } else {
                acc.push({ name: date, value: 1 });
              }
              return acc;
            }, [])
            .sort((a, b) => new Date(b.name) - new Date(a.name))
            .slice(0, 7);

          const nightShiftData = uniqueRows
            .filter(row => row.result === 'NG' && getShift(row.datetime) === '夜班')
            .reduce((acc, row) => {
              const date = row.datetime ? new Date(row.datetime).toISOString().split('T')[0] : today;
              const existing = acc.find(item => item.name === date);
              if (existing) {
                existing.value++;
              } else {
                acc.push({ name: date, value: 1 });
              }
              return acc;
            }, [])
            .sort((a, b) => new Date(b.name) - new Date(a.name))
            .slice(0, 7);

          // 返回与barNG相同格式的数据，但包含白班和夜班
          // 合并为 [{ name, value1, value2 }]
          const dateSet = new Set([
            ...dayShiftData.map(d => d.name),
            ...nightShiftData.map(d => d.name)
          ]);
          let allDates = Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b));
          allDates = allDates.slice(-7); // 只保留最近7天
          const dayMap = Object.fromEntries(dayShiftData.map(d => [d.name, d.value]));
          const nightMap = Object.fromEntries(nightShiftData.map(d => [d.name, d.value]));
          const result = allDates.map(date => ({
            name: date,
            value1: dayMap[date] || 0,
            value2: nightMap[date] || 0
          }));
          res.json(result);
        })
        .catch(error => {
          console.error('查询数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 添加新路由来查看表结构
router.get('/api/tables', (req, res) => {
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('获取表结构失败:', err.message);
      return res.status(500).json({ error: err.message });
    }

    // 获取每个表的结构
    const tablePromises = tables.map(table => {
      return new Promise((resolve, reject) => {
        // 使用引号包裹表名，避免特殊字符问题
        db.all(`PRAGMA table_info("${table.name}")`, [], (err, columns) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              tableName: table.name,
              columns: columns
            });
          }
        });
      });
    });

    Promise.all(tablePromises)
      .then(tableInfos => {
        res.json({ code: 200, data: tableInfos, error: '' });
      })
      .catch(error => {
        console.error('获取表结构失败:', error);
        res.status(500).json({ error: error.message });
      });
  });
});

// 获取所有可用车型接口
router.get('/api/car-types', (req, res) => {
  try {
    // 先获取所有表名
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('获取表列表失败:', err.message);
        return res.status(500).json({ error: err.message });
      }

      // 从所有表中查询数据
      const tablePromises = tables.map(table => {
        return new Promise((resolve, reject) => {
          db.all(`SELECT DISTINCT cartype FROM "${table.name}" WHERE cartype IS NOT NULL AND cartype != ''`, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      });

      Promise.all(tablePromises)
        .then(results => {
          // 合并所有表的车型数据
          const allCarTypes = results.flat().map(row => row.cartype);

          // 去重并过滤空值
          const uniqueCarTypes = [...new Set(allCarTypes)].filter(Boolean);

          // 按字母顺序排序
          const sortedCarTypes = uniqueCarTypes.sort();

          res.json({
            code: 200,
            data: {
              carTypes: sortedCarTypes,
              count: sortedCarTypes.length
            },
            message: '获取车型列表成功'
          });
        })
        .catch(error => {
          console.error('查询车型数据失败:', error);
          res.status(500).json({ error: error.message });
        });
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 使用路由
app.use(router);

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});