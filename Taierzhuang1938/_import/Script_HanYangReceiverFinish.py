"""Seat the visible handguard edge where it meets the stock and collar."""
import numpy as np

from Script_HanYangBandProfiles import SmoothWeight, TransformSurfaceFrames


def WarpFlank(streams, position, row):
    points = streams['POSITION'].astype(np.float64)
    mask = points[:,0] != position
    points[:,0] = position
    result = {**streams, 'POSITION': points.astype('<f4')}
    frames = {key: array[mask] for key, array in streams.items() if key in ('NORMAL','TANGENT')}
    jacobian = np.broadcast_to(np.eye(3),(np.count_nonzero(mask),3,3)).copy()
    jacobian[:,0] = row[mask]
    TransformSurfaceFrames(frames,jacobian)
    for key, array in frames.items():
        result[key] = streams[key].copy()
        result[key][mask] = array
    return result


def BlendReceiverStock(streams):
    x,y,z = streams['POSITION'].astype(np.float64).T
    radius = abs(x)
    sign = np.sign(x)
    front, frontSlope = SmoothWeight((z+.324)/.034)
    rear, rearSlope = SmoothWeight((-.256-z)/.020)
    height, heightSlope = SmoothWeight((y-.023)/.010)
    flank, flankSlope = SmoothWeight((radius-.0087)/.002)
    reach = front*rear
    strength = .91
    amount = strength*reach*height*flank
    shoulder = .01622-radius
    row = np.column_stack((
        1.-amount+shoulder*strength*reach*height*flankSlope/.002,
        sign*shoulder*strength*reach*heightSlope*flank/.010,
        sign*shoulder*strength*height*flank*(frontSlope*rear/.034-front*rearSlope/.020),
    ))
    return WarpFlank(streams,x+sign*shoulder*amount,row)


def SeatReceiverHandguard(streams):
    x,y,z = streams['POSITION'].astype(np.float64).T

    # The stock supports the lower edge. Recess it before the end of the shell
    # so the two surfaces meet along a curve through the stock's upper ledge.
    blend, blendSlope = SmoothWeight((z+.285)/.010)
    heel, heelSlope = SmoothWeight((.0445-y)/.0070)
    stockInset = .095*blend*heel
    stockSlopeY = -.095*blend*heelSlope/.0070
    stockSlopeZ = .095*blendSlope*heel/.010

    # Carry the end face underneath the collar along the sloping shoulder.
    lip, lipSlope = SmoothWeight((z+.273)/.0064)
    rise, riseSlope = SmoothWeight((y-.040)/.0045)
    fall, fallSlope = SmoothWeight((.053-y)/.0050)
    collarInset = .135*lip*rise*fall
    collarSlopeY = .135*lip*(riseSlope*fall/.0045 - rise*fallSlope/.0050)
    collarSlopeZ = .135*lipSlope*rise*fall/.0064

    scale = 1.-stockInset-collarInset
    row = np.column_stack((scale,-x*(stockSlopeY+collarSlopeY),-x*(stockSlopeZ+collarSlopeZ)))
    return WarpFlank(streams,x*scale,row)


def ShapeReceiverWood(name,streams):
    if name.startswith('MainWood_'):
        return BlendReceiverStock(streams)
    if name.startswith('UpperWood_'):
        return SeatReceiverHandguard(streams)
    return streams
