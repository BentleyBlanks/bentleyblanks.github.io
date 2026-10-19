// 高级工具首页的地皮：一块解析平地，别的什么都不建（数据见 Data_ToolsHome）。
// 查询接口全部继承 RangeField；这里只把工事那一步拿掉。
import { RangeField } from "./Script_RangeField.mjs";
import { T } from "./Script_Text.mjs";
import { TOOLS_HOME_ID, TOOLS_HOME_WORLD } from "./Data_ToolsHome.mjs";

export class ToolsHomeField extends RangeField {
  constructor(scene, library, options = {}) {
    super(scene, library, { zones: [], levelId: TOOLS_HOME_ID, ...options });
    this.worldLimits = TOOLS_HOME_WORLD;
    this.cameraFar = 120;
  }

  *BuildSteps() {
    this.BuildGround();
    this.BuildCollisionGrid();
    yield { label: T("range.build.ready"), progress: 1 };
  }
}
