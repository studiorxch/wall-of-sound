# 0605L_WOS_OccupantPOVCameraFramework_v1.0.0_BUILD

## Purpose

Establish canonical occupant-based camera anchors for WOS.

This framework answers a single question:

Where is the viewer sitting?

Occupancy -> Anchor -> Lens -> Presentation

## Canonical Anchors

- driver_seat
- front_passenger
- rear_seat
- windshield_view
- left_window_view
- right_window_view
- rear_window_view
- bus_front_window
- walker_head
- bike_rider
- ferry_passenger

## Vehicle Profiles

### Car
Driver: x=-0.35 y=0.20 z=1.25
Passenger: x=0.35 y=0.20 z=1.25
Rear: x=0.00 y=-0.55 z=1.20

### Bus
Front Window: x=0.00 y=1.80 z=2.30
Passenger: x=0.00 y=0.50 z=2.10

### Walker
Head: x=0 y=0 z=1.65

### Bike
Rider: x=0 y=0 z=1.55

### Ferry
Passenger Deck: x=0 y=0 z=4.00

## API

```javascript
OccupantPOVCameraFramework.resolveAnchor(actor, anchorId);
```

## Success Criteria

Supports cars, buses, walkers, bikes, boats, and future actor classes without introducing lens, framing, or cinematic behavior.
