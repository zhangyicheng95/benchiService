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
    if (!row || typeof row !== 'object' || !row.PN) {
      continue; // 跳过无效数据或没有车辆ID的数据
    }

    const vehicleId = row.PN;

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

// 获取结果汇总
router.get('/api/statistic', (req, res) => {
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

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(allRows);

          // 计算统计数据
          const today = new Date().toISOString().split('T')[0];
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          // 计算今日数据
          const todayData = uniqueRows.filter(row => row.datetime && row.datetime.startsWith(today));
          const todayCount = todayData.length;

          // 计算近七日数据
          const weekData = uniqueRows.filter(row => row.datetime && row.datetime >= sevenDaysAgo);
          const weekCount = weekData.length;

          // 计算总计数据
          const totalCount = uniqueRows.length;

          // 获取所有不同的车辆型号
          const vehicleModels = [...new Set(uniqueRows.map(row => row.carType).filter(Boolean))];
          const currentModel = vehicleModels[0] || 'V206';

          res.json({ todayCount, weekCount, totalCount: `${Math.floor(totalCount / 1000)} 千`, currentModel });
          // res.json(results);
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

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(allRows);

          // 计算统计数据
          const today = new Date().toISOString().split('T')[0];
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          const result = uniqueRows
            .filter(row => row.result === 'OK')
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

          res.json(result);
          // res.json(results);
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

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(allRows);

          // 计算统计数据
          const today = new Date().toISOString().split('T')[0];

          res.json(uniqueRows
            .filter(row => row.result === 'NG')
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
            .slice(0, 7));
          // res.json(results);
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

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(allRows);

          // 计算统计数据
          const today = new Date().toISOString().split('T')[0];
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          res.json(uniqueRows
            .filter(row => row.result === 'NG')
            .reduce((acc, row) => {
              const defect = row.errtype || '未知缺陷';
              const existing = acc.find(item => item.name === defect);
              if (existing) {
                existing.value++;
              } else {
                acc.push({ name: defect, value: 1 });
              }
              return acc;
            }, []));
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

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(allRows);

          // 计算统计数据
          const today = new Date().toISOString().split('T')[0];
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          console.log(JSON.stringify(uniqueRows
            .filter(row => row.result === 'NG' && row.datetime && row.datetime >= sevenDaysAgo)))
          res.json(uniqueRows
            .filter(row => row.result === 'NG' && row.datetime && row.datetime >= sevenDaysAgo)
            .reduce((acc, row) => {
              const defect = row.errtype || '未知缺陷';
              const existing = acc.find(item => item.name === defect);
              if (existing) {
                existing.value++;
              } else {
                acc.push({ name: defect, value: 1 });
              }
              return acc;
            }, []));
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

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(allRows);

          // 构建返回数据
          const responseData = {
            line: uniqueRows
              .filter(row => row.result === 'NG')
              .reduce((acc, row) => {
                const errtype = row.errtype || '未知缺陷';
                const existing = acc.find(item => item.name === errtype);
                if (existing) {
                  existing.value++;
                } else {
                  acc.push({ name: errtype, value: 1 });
                }
                return acc;
              }, [])
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
          };

          res.json(responseData.line);
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

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(allRows);

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

          // 对数据进行去重 - 基于车辆ID
          const uniqueRows = removeDuplicatesByVehicleId(allRows);

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

const mock = {
  topNumber: [
    {
      title: '今日',
      number: 57,
    },
    {
      title: '近七日',
      number: 1233,
    },
    {
      title: '总计',
      number: 562,
      unit: '千',
    },
    {
      title: '型号',
      number: 'V206',
    }
  ],
  bar: {
    "OK": [{ name: '2025-02-22', value: 103 }, { name: '2025-02-23', value: 103 }, { name: '2025-02-24', value: 103 }, { name: '2025-02-25', value: 103 }, { name: '2025-02-26', value: 103 }, { name: '2025-02-27', value: 103 }, { name: '2025-02-28', value: 103 }],
    "NG": [{ name: '2025-02-22', value: 163 }, { name: '2025-02-23', value: 103 }, { name: '2025-02-24', value: 103 }, { name: '2025-02-25', value: 103 }, { name: '2025-02-26', value: 103 }, { name: '2025-02-27', value: 103 }, { name: '2025-02-28', value: 103 }]
  },
  pie: {
    all: [
      { name: '缺陷1', value: 23 }, { name: '缺陷2', value: 27 }, { name: '缺陷3', value: 30 }, { name: '缺陷4', value: 33 }, { name: '缺陷5', value: 36 }, { name: '缺陷6', value: 39 }, { name: '缺陷7', value: 42 },
      { name: '缺陷8', value: 45 }, { name: '缺陷9', value: 48 }, { name: '缺陷10', value: 51 }, { name: '缺陷11', value: 54 }, { name: '缺陷12', value: 57 }, { name: '缺陷13', value: 60 }, { name: '缺陷14', value: 63 },
    ],
    week: [
      { name: '缺陷1', value: 53 }, { name: '缺陷2', value: 63 }, { name: '缺陷3', value: 73 }, { name: '缺陷4', value: 83 }, { name: '缺陷5', value: 103 }
    ],
  },
  line: [
    { name: '缺陷1', value: 53 }, { name: '缺陷2', value: 63 }, { name: '缺陷3', value: 73 }, { name: '缺陷4', value: 83 }, { name: '缺陷5', value: 103 }
  ]
};