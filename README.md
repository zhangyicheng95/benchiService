# 奔驰服务API接口文档

## 概述

这是一个基于Node.js和SQLite的API服务，用于提供奔驰生产数据的统计和分析功能。所有接口都支持按车型（V254、V214）进行数据过滤。

## 数据库结构

数据库包含两种类型的表：
- `Qualitydata_YYYYMMDD` - 质量数据表
- `pointdata_YYYYMMDD` - 点位数据表

主要字段：
- `cartype`: 车型（V254、V214等）
- `ordernum`: 订单号/车辆ID
- `datetime`: 时间戳
- `result`: 检测结果（OK/NG）
- `errtype`: 错误类型
- `point`: 检测点位

## API接口列表

### 1. 获取车型列表
**接口地址：** `GET /api/car-types`

**描述：** 获取数据库中所有可用的车型列表

**响应示例：**
```json
{
  "code": 200,
  "data": {
    "carTypes": ["V214", "V254"],
    "count": 2
  },
  "message": "获取车型列表成功"
}
```

### 2. 获取当前时间
**接口地址：** `GET /api/current-time`

**描述：** 获取服务器当前时间

**响应示例：**
```json
{
  "code": 200,
  "data": {
    "timestamp": 1754969168670,
    "isoString": "2025-08-12T03:26:08.670Z",
    "localString": "2025/08/12 11:26:08",
    "date": "2025-08-12",
    "time": "11:26:08",
    "timezone": "Asia/Shanghai"
  },
  "message": "获取当前时间成功"
}
```

### 3. 统计数据汇总
**接口地址：** `GET /api/statistic`

**参数：**
- `carType` (可选): 车型过滤，支持 `V254`、`V214`、`ALL`（默认）

**响应示例：**
```json
{
  "todayCount": 57,
  "weekCount": 1233,
  "totalCount": "562 千",
  "currentModel": "V254",
  "carType": "V254"
}
```

### 4. OK数据统计
**接口地址：** `GET /api/barOK`

**参数：**
- `carType` (可选): 车型过滤

**响应示例：**
```json
[
  {"name": "2025-08-12", "value": 103},
  {"name": "2025-08-11", "value": 98}
]
```

### 5. NG数据统计
**接口地址：** `GET /api/barNG`

**参数：**
- `carType` (可选): 车型过滤

**响应示例：**
```json
[
  {"name": "2025-08-12", "value": 15},
  {"name": "2025-08-11", "value": 12}
]
```

### 6. 全部缺陷统计
**接口地址：** `GET /api/pieALL`

**参数：**
- `carType` (可选): 车型过滤

**响应示例：**
```json
[
  {"name": "缺陷1", "value": 23},
  {"name": "缺陷2", "value": 27}
]
```

### 7. 周缺陷统计
**接口地址：** `GET /api/pieWEEK`

**参数：**
- `carType` (可选): 车型过滤

**响应示例：**
```json
[
  {"name": "缺陷1", "value": 53},
  {"name": "缺陷2", "value": 63}
]
```

### 8. 缺陷趋势线图
**接口地址：** `GET /api/line`

**参数：**
- `carType` (可选): 车型过滤

**响应示例：**
```json
[
  {"name": "缺陷1", "value": 53},
  {"name": "缺陷2", "value": 63}
]
```

### 9. 班次OK数据
**接口地址：** `GET /api/barShiftOK`

**参数：**
- `carType` (可选): 车型过滤

**响应示例：**
```json
[
  {"name": "2025-08-12", "value1": 50, "value2": 53},
  {"name": "2025-08-11", "value1": 48, "value2": 50}
]
```
注：value1为白班数据，value2为夜班数据

### 10. 班次NG数据
**接口地址：** `GET /api/barShiftNG`

**参数：**
- `carType` (可选): 车型过滤

**响应示例：**
```json
[
  {"name": "2025-08-12", "value1": 8, "value2": 7},
  {"name": "2025-08-11", "value1": 6, "value2": 6}
]
```

### 11. 数据库表结构
**接口地址：** `GET /api/tables`

**描述：** 获取数据库中所有表的结构信息

## 使用示例

### 获取V254车型的统计数据
```bash
curl "http://localhost:3000/api/statistic?carType=V254"
```

### 获取V214车型的OK数据
```bash
curl "http://localhost:3000/api/barOK?carType=V214"
```

### 获取所有车型的缺陷统计
```bash
curl "http://localhost:3000/api/pieALL"
```

## 启动服务

```bash
node index-menxian.js
```

服务将在端口3000上运行。

## 注意事项

1. 所有接口都支持车型过滤参数 `carType`
2. 车型参数支持的值：`V254`、`V214`、`ALL`
3. 如果不传车型参数，默认为 `ALL`（所有车型）
4. 时间数据使用中国时区（Asia/Shanghai）
5. 班次定义：白班 7:00-19:00，夜班 19:00-7:00 