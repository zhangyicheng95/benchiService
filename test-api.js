const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
  console.log('开始测试API接口...\n');

  try {
    // 测试获取车型列表
    console.log('1. 测试获取车型列表:');
    const carTypesResponse = await axios.get(`${BASE_URL}/api/car-types`);
    console.log('响应:', JSON.stringify(carTypesResponse.data, null, 2));
    console.log('');

    // 测试获取当前时间
    console.log('2. 测试获取当前时间:');
    const timeResponse = await axios.get(`${BASE_URL}/api/current-time`);
    console.log('响应:', JSON.stringify(timeResponse.data, null, 2));
    console.log('');

    // 测试统计接口 - 所有车型
    console.log('3. 测试统计接口 (所有车型):');
    const allStatsResponse = await axios.get(`${BASE_URL}/api/statistic`);
    console.log('响应:', JSON.stringify(allStatsResponse.data, null, 2));
    console.log('');

    // 测试统计接口 - V254
    console.log('4. 测试统计接口 (V254):');
    const v254StatsResponse = await axios.get(`${BASE_URL}/api/statistic?carType=V254`);
    console.log('响应:', JSON.stringify(v254StatsResponse.data, null, 2));
    console.log('');

    // 测试统计接口 - V214
    console.log('5. 测试统计接口 (V214):');
    const v214StatsResponse = await axios.get(`${BASE_URL}/api/statistic?carType=V214`);
    console.log('响应:', JSON.stringify(v214StatsResponse.data, null, 2));
    console.log('');

    console.log('✅ 主要API接口测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

// 运行测试
testAPI(); 