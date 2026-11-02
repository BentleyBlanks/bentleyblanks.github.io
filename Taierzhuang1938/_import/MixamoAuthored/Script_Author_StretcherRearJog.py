# StretcherRearJog「担架·抬后头小跑」 (Claude, 2026-11-01)
#
# 这是什么：两个人抬担架小跑，走在后头的那一个。两臂换成「吃重下垂握杆」的姿势（两手不摆臂），
#   两手在大腿前外侧各握一根杆，掌心相距 0.58 m，离地约 0.785 m、在髋关节前约 11 cm；上身因负重略后仰、肩下沉；
#   步幅、身体起伏照小跑，但比空手慢跑小一点。原地循环（loop: true），预览自动挂担架。
#
# 改自：Animation_Mixamo_SlowRun_V1（空手慢跑，原地循环，第 23 帧 = 第 1 帧）。
#   做法与 StretcherRearWalk 完全相同（共用 Script_Author_StretcherRearWalk.Build）：
#   * 重新计时：22 帧一个循环（0.73 s）拉成 29 帧（0.97 s）；脚的前后行程乘 0.80；
#     支撑脚速度从约 3.1 m/s 降到约 1.9 m/s。
#   * 骨盆上下起伏乘 0.35（原件上下约 14 cm，缩到约 5 cm）、左右摆乘 0.60；
#   * 躯干整体后仰到约 -2 度（原件前倾约 19 度）：骨盆回倾 35%，三节脊柱分担其余，头的世界朝向跟原件一致；
#   * 锁骨向下压 6 度；两臂逐帧 IK 接到肩上（掌心高度只跟肩起伏的 45%）；
#   * 手的朝向与手指握拳取自 Animation_Mixamo_WheelbarrowWalk_V2 第 1 帧（和抬后头走同一个握法）；
#   * 两腿逐帧 IK，脚踝位置 = 原件脚踝（前后行程 x0.80，高度不变）；首尾相同。
# 关键帧时间表：见 meta.timings（两脚各自最靠前的时刻、骨盆最高/最低时刻，运行时从结果量出）。
# 史实：战地抬担架小跑赶路（竹竿布兜担架，手抬不肩扛）；速度约 1.9 m/s，抬着伤员只能是慢跑。
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import Script_Author_StretcherRearWalk as W

JOG = dict(W.WALK)
JOG.update(
    name="StretcherRearJog", base="Animation_Mixamo_SlowRun_V1", label="担架·抬后头小跑",
    cycle=22, M=30, kappa=0.80, hips_smooth=5, ankle_smooth=2, bounce=0.35, foot_smooth=3, toe_smooth=4, sway=0.60, lean=-1.0, hip_share=0.35, depress=12.0,
    palm_z=0.785, reach=0.538, stance_knee=146.0, sh_comp=0.60, hunch=6.0, depress_max=20.0, lam_z=0.5, lam_xy=0.50, palm_fwd=-0.11,
    note="担架后头小跑：两臂下垂吃重不摆臂（肘微屈约 140-160 度），两手握杆在大腿前外侧（掌心在髋关节前约 11 cm，臂略前伸，迈腿时大腿不碰担架布那头的横档），掌心相距 0.58 m、离地约 0.785 m，肩下沉，上身略后仰，步幅比空手慢跑小。原地循环，预览自动挂担架。",
)

if __name__ == "__main__":
    W.Build(JOG)
